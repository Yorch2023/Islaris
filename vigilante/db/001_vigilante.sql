-- =============================================================================
--  VIGILANTE DE CONVOCATORIAS (subvenciones y licitaciones) — BASE DE DATOS DESDE CERO
--  PostgreSQL 15+
--
--  Qué hace el vigilante:
--   1. Unos ~50 scrapers/APIs (PLACSP, TED, BOE, BDNS, CDTI, BOAMP, SAM.gov, SECOP,
--      Banco Mundial…) traen convocatorias nuevas cada día o semana.
--   2. Un filtro por palabras clave les pone relevancia (alta/media/baja) y una
--      puntuación 0-1000 (relevancia + urgencia + importe + palabras clave).
--   3. Una IA (Claude) hace el triaje: relevante / dudosa / descartada, con encaje 0-100
--      y una frase de motivo. Bajo demanda, un análisis en profundidad.
--   4. El equipo revisa el feed: sigue, descarta (con motivo, que alimenta el
--      aprendizaje) o crea un expediente en el ERP.
--   5. Trabajos diarios: caducar vencidas, alertas de plazo, búsquedas guardadas con
--      aviso por email, resultados de adjudicación del mercado (competencia), BORME.
--
--  Sacado del ERP actual (tabla convocatorias_vigiladas y satélites, ~9.000
--  convocatorias) y de lo aprendido usándolo. [LECCIÓN] = problema real que esto evita.
--
--  Es independiente del resto del ERP: el vínculo con un expediente es una referencia
--  de texto (expediente_ref) para poder enchufarlo a cualquier ERP.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- búsqueda difusa y detección de duplicados
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE SCHEMA IF NOT EXISTS vigilante;
SET search_path = vigilante, public;

-- unaccent() no es IMMUTABLE y no se puede usar en índices: envoltorio inmutable
CREATE OR REPLACE FUNCTION vigilante.f_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN public.unaccent('public.unaccent'::regdictionary, $1);

CREATE OR REPLACE FUNCTION vigilante.tg_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;


-- =============================================================================
-- 1. CATÁLOGOS
-- =============================================================================

-- Fuentes (un scraper / API / origen por fila) y cuándo se ejecutan
CREATE TABLE fuente (
    codigo          text PRIMARY KEY,           -- 'PLACE', 'TED', 'BDNS', 'IA-LICITACION'…
    nombre          text NOT NULL,
    pais            text,                       -- ISO-2; NULL = supranacional
    tipo_principal  text NOT NULL CHECK (tipo_principal IN ('subvencion','licitacion','ambos','aviso')),
    url_base        text,
    -- Cron de ejecución (mismo formato que el scheduler: minuto hora día mes día_semana)
    cron            text,
    captura_cpv     boolean NOT NULL DEFAULT false,   -- solo algunas fuentes publican CPV
    captura_pliegos boolean NOT NULL DEFAULT false,   -- PLACSP: URL de PCAP/PPT en el feed
    traduce         boolean NOT NULL DEFAULT false,   -- títulos en otro idioma → español
    es_ia           boolean NOT NULL DEFAULT false,   -- descubrimiento por búsqueda web con IA
    activa          boolean NOT NULL DEFAULT true
);

-- Estado de cada scraper (salud del vigilante)
CREATE TABLE fuente_ejecucion (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fuente          text NOT NULL REFERENCES fuente(codigo),
    inicio          timestamptz NOT NULL DEFAULT now(),
    fin             timestamptz,
    estado          text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso','ok','error')),
    leidas          integer NOT NULL DEFAULT 0,
    nuevas          integer NOT NULL DEFAULT 0,
    actualizadas    integer NOT NULL DEFAULT 0,
    mensaje         text
);
CREATE INDEX fuente_ejecucion_ultima ON fuente_ejecucion (fuente, inicio DESC);
-- [LECCIÓN] Hubo scrapers rotos semanas sin que nadie lo viera: ver v_salud_fuentes.

CREATE TABLE palabra_clave (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    keyword    text NOT NULL,
    categoria  text NOT NULL CHECK (categoria IN ('programas-financiacion','subvenciones',
                  'licitaciones','maritimo-portuario','tecnologia-digital')),
    -- Peso en la relevancia: un programa propio (Neotec, Canarias Aporta) entra directo
    -- como relevante; un término marítimo genérico ("puerto") solo no basta.
    es_ancla   boolean NOT NULL DEFAULT false,
    activa     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX palabra_clave_unica ON palabra_clave (lower(vigilante.f_unaccent(keyword)));

CREATE TABLE motivo_descarte (
    codigo  text PRIMARY KEY,
    nombre  text NOT NULL
);

-- Organismos convocantes normalizados
-- [LECCIÓN] Con texto libre el mismo órgano salía con varios nombres, y los de TED
-- llegaban como "España (ESP)". El alias permite resolver lo que trae cada fuente.
CREATE TABLE organismo (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre        text NOT NULL,
    nombre_corto  text,
    nif           text UNIQUE,
    dir3          text UNIQUE,
    tipo          text CHECK (tipo IN ('estatal','autonomico','local','portuario','universidad',
                     'empresa_publica','ue','multilateral','extranjero','otro')),
    pais          text NOT NULL DEFAULT 'ES',
    -- Interés comercial: autoridades portuarias, Puertos del Estado… (sube la prioridad)
    es_objetivo   boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organismo_nombre_trgm ON organismo USING gin (nombre gin_trgm_ops);

CREATE TABLE organismo_alias (
    organismo_id  bigint NOT NULL REFERENCES organismo(id) ON DELETE CASCADE,
    alias         text NOT NULL,
    PRIMARY KEY (organismo_id, alias)
);
CREATE UNIQUE INDEX organismo_alias_unico ON organismo_alias (lower(vigilante.f_unaccent(alias)));


-- =============================================================================
-- 2. CONVOCATORIAS
-- =============================================================================

CREATE TABLE convocatoria (
    id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fuente                   text NOT NULL REFERENCES fuente(codigo),
    external_id              text NOT NULL,              -- id estable en la fuente
    tipo                     text NOT NULL CHECK (tipo IN ('subvencion','licitacion')),
    -- [LECCIÓN] Una consulta preliminar al mercado, un RFI o un anuncio de información
    -- pública NO son licitaciones aunque vengan del mismo feed.
    subtipo                  text NOT NULL DEFAULT 'convocatoria' CHECK (subtipo IN
                               ('convocatoria','anuncio_previo','consulta_preliminar','rfi',
                                'informacion_publica','resolucion','otro')),
    titulo                   text NOT NULL,              -- en español
    titulo_original          text,                       -- antes de traducir
    idioma_original          char(2),
    resumen                  text,
    organismo_id             bigint REFERENCES organismo(id),
    organismo_texto          text,                       -- tal como vino
    numero_expediente_organo text,                       -- 'CONT26063', 'G-2026/25', código BDNS…
    pais                     text,                       -- ISO-2
    ambito                   text CHECK (ambito IN ('nacional','extranjero')),
    cpv                      text[],
    fecha_publicacion        timestamptz,
    fecha_limite             timestamptz,
    ventanilla_permanente    boolean NOT NULL DEFAULT false,   -- sin plazo propio (programas abiertos)
    -- Importes tal como los publica la fuente, cada uno con su nombre
    -- [LECCIÓN] Se mezclaban presupuesto, valor estimado (incluye prórrogas) e importe
    -- con impuestos en un solo campo "importe_maximo".
    presupuesto_sin_impuestos numeric(14,2),
    presupuesto_con_impuestos numeric(14,2),
    valor_estimado           numeric(14,2),
    importe_max_ayuda        numeric(14,2),              -- subvenciones: ayuda máxima / presupuesto convocatoria
    moneda                   char(3) NOT NULL DEFAULT 'EUR',
    -- Enlaces
    url_original             text,
    url_pliego_administrativo text,                      -- PCAP (solo PLACSP, capturado en el momento)
    url_pliego_tecnico       text,                       -- PPT
    url_bases                text,
    -- Clasificación por palabras clave
    keywords_coincidentes    text[],
    relevancia               text NOT NULL DEFAULT 'baja' CHECK (relevancia IN ('alta','media','baja')),
    score                    smallint NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 1000),
    -- Flujo de revisión
    estado                   text NOT NULL DEFAULT 'nueva' CHECK (estado IN
                               ('nueva',          -- sin revisar
                                'en_seguimiento', -- el equipo la está mirando
                                'descartada',     -- descartada por una persona (exige motivo)
                                'ignorada',       -- filtrada automáticamente (resolución, morralla)
                                'archivada',      -- limpieza: baja relevancia o antigua sin fecha
                                'vencida',        -- plazo pasado (se reactiva si amplían el plazo)
                                'convertida')),   -- pasó a expediente
    motivo_descarte          text REFERENCES motivo_descarte(codigo),
    revisada_por             text,
    revisada_at              timestamptz,
    expediente_ref           text,                       -- referencia del expediente en el ERP
    -- Corrección humana: el scraper no la vuelve a pisar
    corregido_manualmente    boolean NOT NULL DEFAULT false,
    -- [LECCIÓN] El mismo anuncio llega por PLACSP y por TED (y por el perfil del puerto):
    -- se marca como duplicado de la original en vez de entrar dos veces al feed.
    duplicado_de_id          bigint REFERENCES convocatoria(id),
    -- Triaje IA
    triage_clasificacion     text CHECK (triage_clasificacion IN ('relevante','dudosa','descartada')),
    triage_encaje            smallint CHECK (triage_encaje BETWEEN 0 AND 100),
    triage_motivo            text,
    triage_convocante        text,                       -- quién convoca, limpio
    triage_importe           text,                       -- importe interpretado (texto)
    triage_modelo            text,
    triage_fecha             timestamptz,                -- si tiene fecha, no se vuelve a triar
    -- Análisis en profundidad (bajo demanda): veredicto, puntuación, desglose, riesgos
    analisis                 jsonb,
    analisis_fecha           timestamptz,
    -- Nota informativa para clientes (Markdown)
    resumen_cliente_md       text,
    resumen_cliente_fecha    timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    UNIQUE (fuente, external_id),
    CHECK (duplicado_de_id IS NULL OR duplicado_de_id <> id),
    CHECK (estado <> 'descartada' OR motivo_descarte IS NOT NULL),
    CHECK (estado <> 'convertida' OR expediente_ref IS NOT NULL),
    CHECK (NOT ventanilla_permanente OR fecha_limite IS NULL),
    CHECK (presupuesto_con_impuestos IS NULL OR presupuesto_sin_impuestos IS NULL
           OR presupuesto_con_impuestos >= presupuesto_sin_impuestos),
    CHECK (valor_estimado IS NULL OR presupuesto_sin_impuestos IS NULL
           OR valor_estimado >= presupuesto_sin_impuestos)
);
CREATE INDEX convocatoria_feed     ON convocatoria (estado, score DESC) WHERE duplicado_de_id IS NULL;
CREATE INDEX convocatoria_triage   ON convocatoria (triage_clasificacion, triage_encaje DESC);
CREATE INDEX convocatoria_limite   ON convocatoria (fecha_limite);
CREATE INDEX convocatoria_sin_triar ON convocatoria (created_at) WHERE triage_fecha IS NULL;
CREATE INDEX convocatoria_titulo_trgm ON convocatoria USING gin (titulo gin_trgm_ops);
CREATE INDEX convocatoria_cpv      ON convocatoria USING gin (cpv);
-- Un expediente de un órgano entra una sola vez (el resto, como duplicados)
CREATE UNIQUE INDEX convocatoria_expediente_organo_unico
    ON convocatoria (organismo_id, numero_expediente_organo)
    WHERE numero_expediente_organo IS NOT NULL AND duplicado_de_id IS NULL;

CREATE TRIGGER convocatoria_updated_at BEFORE UPDATE ON convocatoria
    FOR EACH ROW EXECUTE FUNCTION vigilante.tg_updated_at();

-- Lotes (licitaciones)
CREATE TABLE convocatoria_lote (
    id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    convocatoria_id           bigint NOT NULL REFERENCES convocatoria(id) ON DELETE CASCADE,
    numero                    text NOT NULL,
    descripcion               text,
    presupuesto_sin_impuestos numeric(14,2),
    cpv                       text[],
    UNIQUE (convocatoria_id, numero)
);

-- Historial de cambios que trae la fuente (plazo ampliado, importe corregido, rectificación)
-- [LECCIÓN] Una ampliación de plazo debe reactivar una convocatoria 'vencida'.
CREATE TABLE convocatoria_cambio (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    convocatoria_id  bigint NOT NULL REFERENCES convocatoria(id) ON DELETE CASCADE,
    campo            text NOT NULL,
    valor_anterior   text,
    valor_nuevo      text,
    origen           text NOT NULL DEFAULT 'scraper' CHECK (origen IN ('scraper','usuario','ia')),
    created_at       timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- 3. APRENDIZAJE Y BÚSQUEDAS
-- =============================================================================

-- Feedback de descarte: con qué motivo se descarta qué (para afinar keywords y prompt).
-- Guarda una copia de los datos por si la convocatoria se borra.
CREATE TABLE feedback_descarte (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    convocatoria_id     bigint REFERENCES convocatoria(id) ON DELETE SET NULL,
    titulo_snapshot     text,
    organismo_snapshot  text,
    fuente_snapshot     text,
    keywords_snapshot   text[],
    triage_snapshot     text,                      -- qué dijo la IA (para medir acierto)
    motivo              text NOT NULL REFERENCES motivo_descarte(codigo),
    detalle             text,
    usuario             text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Búsquedas guardadas con aviso por email cuando entra algo nuevo que las cumple
CREATE TABLE busqueda_guardada (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_email    text NOT NULL,
    nombre           text NOT NULL,
    q                text,                         -- texto libre: título / organismo / resumen
    tipo             text CHECK (tipo IN ('subvencion','licitacion')),
    fuentes          text[],                       -- vacío = todas
    paises           text[],
    importe_min      numeric(14,2),
    importe_max      numeric(14,2),
    encaje_min       smallint CHECK (encaje_min BETWEEN 0 AND 100),   -- umbral de aviso
    cpv_prefijos     text[],                       -- '72', '48'…
    notificar_email  boolean NOT NULL DEFAULT true,
    activa           boolean NOT NULL DEFAULT true,
    last_checked_at  timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (importe_max IS NULL OR importe_min IS NULL OR importe_max >= importe_min)
);

-- Qué convocatorias se han avisado ya por cada búsqueda (para no repetir avisos)
CREATE TABLE busqueda_aviso (
    busqueda_id      bigint NOT NULL REFERENCES busqueda_guardada(id) ON DELETE CASCADE,
    convocatoria_id  bigint NOT NULL REFERENCES convocatoria(id) ON DELETE CASCADE,
    avisada_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (busqueda_id, convocatoria_id)
);


-- =============================================================================
-- 4. INTELIGENCIA DE MERCADO
-- =============================================================================

-- Resultados de adjudicación de TODO el mercado (PLACSP TenderResult), filtrados por sector:
-- nº de licitadores esperado y quién suele ganar en cada nicho.
CREATE TABLE adjudicacion_mercado (
    id                         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fuente                     text NOT NULL REFERENCES fuente(codigo),
    external_id                text NOT NULL UNIQUE,
    convocatoria_id            bigint REFERENCES convocatoria(id) ON DELETE SET NULL,
    organismo_id               bigint REFERENCES organismo(id),
    organismo_texto            text,
    titulo                     text,
    lote                       text,
    presupuesto_sin_impuestos  numeric(14,2),
    importe_adjudicado_sin_impuestos numeric(14,2),
    numero_licitadores         smallint,
    adjudicatario_nombre       text,
    adjudicatario_nif          text,
    fecha_adjudicacion         date,
    keywords_coincidentes      text[],
    created_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX adjudicacion_adjudicatario_trgm ON adjudicacion_mercado USING gin (adjudicatario_nombre gin_trgm_ops);
CREATE INDEX adjudicacion_organismo ON adjudicacion_mercado (organismo_id, fecha_adjudicacion DESC);

CREATE TABLE competidor (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      text NOT NULL UNIQUE,
    nif         text UNIQUE,
    notas       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Avisos del BORME (nombramientos, ceses, disoluciones…) sobre empresas que interesan.
-- No son convocatorias: tabla propia para que el triaje no los evalúe como si lo fueran.
CREATE TABLE empresa_vigilada (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  text NOT NULL,
    nif     text UNIQUE,
    tipo    text NOT NULL CHECK (tipo IN ('grupo','cliente','socio','competidor'))
);

CREATE TABLE aviso_borme (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    external_id         text UNIQUE,
    fecha_publicacion   date,
    empresa_vigilada_id bigint REFERENCES empresa_vigilada(id) ON DELETE SET NULL,
    empresa_detectada   text NOT NULL,
    acto_resumen        text,
    provincia           text,
    url_pdf             text,
    leido               boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- 5. LÓGICA EN LA BASE DE DATOS
-- =============================================================================

-- Puntuación 0-1000 (misma fórmula que scrapers/utils.py::calcular_score):
--   relevancia alta=600, media=350, baja=80
--   urgencia: ≤7 días 200, ≤30 días 120, ≤90 días 60, más 20; vencida → 0 en total
--   importe: log10(importe)·10, máx. 100
--   palabras clave: 10 por coincidencia, máx. 50
--   La relevancia BAJA no suma nada más (tope 80), para que la morralla urgente y cara
--   no suba por encima de lo relevante.
CREATE OR REPLACE FUNCTION vigilante.calcular_score(
    p_relevancia text, p_fecha_limite timestamptz, p_importe numeric, p_n_keywords int)
RETURNS smallint LANGUAGE plpgsql STABLE AS $$
DECLARE
    dias integer;
    base integer := CASE p_relevancia WHEN 'alta' THEN 600 WHEN 'media' THEN 350 ELSE 80 END;
    urg  integer := 0;
    imp  integer := 0;
BEGIN
    IF p_fecha_limite IS NOT NULL THEN
        dias := floor(extract(epoch FROM (p_fecha_limite - now())) / 86400);
        IF dias < 0 THEN RETURN 0; END IF;
    END IF;
    IF p_relevancia NOT IN ('alta','media') THEN RETURN base; END IF;
    IF dias IS NOT NULL THEN
        urg := CASE WHEN dias <= 7 THEN 200 WHEN dias <= 30 THEN 120 WHEN dias <= 90 THEN 60 ELSE 20 END;
    END IF;
    IF coalesce(p_importe, 0) > 0 THEN
        imp := least(floor(log(greatest(p_importe, 1)) * 10)::int, 100);
    END IF;
    RETURN least(base + urg + imp + least(coalesce(p_n_keywords, 0) * 10, 50), 1000);
END $$;

CREATE OR REPLACE FUNCTION vigilante.tg_convocatoria_score() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.score := vigilante.calcular_score(
        NEW.relevancia, NEW.fecha_limite,
        coalesce(NEW.presupuesto_sin_impuestos, NEW.importe_max_ayuda, NEW.valor_estimado),
        coalesce(array_length(NEW.keywords_coincidentes, 1), 0));
    RETURN NEW;
END $$;
CREATE TRIGGER convocatoria_score
    BEFORE INSERT OR UPDATE OF relevancia, fecha_limite, presupuesto_sin_impuestos,
                               importe_max_ayuda, valor_estimado, keywords_coincidentes
    ON convocatoria FOR EACH ROW EXECUTE FUNCTION vigilante.tg_convocatoria_score();

-- Ampliación de plazo: si la fuente trae una fecha límite nueva y futura, una convocatoria
-- 'vencida' o 'archivada' vuelve al feed. Se registra el cambio.
CREATE OR REPLACE FUNCTION vigilante.tg_convocatoria_cambios() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.fecha_limite IS DISTINCT FROM OLD.fecha_limite THEN
        INSERT INTO vigilante.convocatoria_cambio (convocatoria_id, campo, valor_anterior, valor_nuevo)
        VALUES (NEW.id, 'fecha_limite', OLD.fecha_limite::text, NEW.fecha_limite::text);
        IF OLD.estado IN ('vencida','archivada') AND NEW.fecha_limite > now() THEN
            NEW.estado := 'nueva';
        END IF;
    END IF;
    IF NEW.presupuesto_sin_impuestos IS DISTINCT FROM OLD.presupuesto_sin_impuestos THEN
        INSERT INTO vigilante.convocatoria_cambio (convocatoria_id, campo, valor_anterior, valor_nuevo)
        VALUES (NEW.id, 'presupuesto_sin_impuestos',
                OLD.presupuesto_sin_impuestos::text, NEW.presupuesto_sin_impuestos::text);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER convocatoria_cambios BEFORE UPDATE ON convocatoria
    FOR EACH ROW EXECUTE FUNCTION vigilante.tg_convocatoria_cambios();

-- Descartar a mano deja feedback para el aprendizaje
CREATE OR REPLACE FUNCTION vigilante.tg_convocatoria_feedback() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.estado = 'descartada' AND OLD.estado IS DISTINCT FROM 'descartada' THEN
        INSERT INTO vigilante.feedback_descarte
            (convocatoria_id, titulo_snapshot, organismo_snapshot, fuente_snapshot,
             keywords_snapshot, triage_snapshot, motivo, usuario)
        VALUES (NEW.id, NEW.titulo, NEW.organismo_texto, NEW.fuente,
                NEW.keywords_coincidentes, NEW.triage_clasificacion, NEW.motivo_descarte, NEW.revisada_por);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER convocatoria_feedback AFTER UPDATE OF estado ON convocatoria
    FOR EACH ROW EXECUTE FUNCTION vigilante.tg_convocatoria_feedback();

-- Trabajo diario (07:15): caducar lo vencido y recalcular la urgencia
CREATE OR REPLACE PROCEDURE vigilante.mantenimiento_diario() LANGUAGE plpgsql AS $$
BEGIN
    UPDATE vigilante.convocatoria SET estado = 'vencida'
     WHERE estado IN ('nueva','en_seguimiento') AND fecha_limite < now();
    -- forzar el recálculo del score (la urgencia depende de la fecha de hoy)
    UPDATE vigilante.convocatoria SET relevancia = relevancia
     WHERE fecha_limite >= now() - interval '1 day' AND estado NOT IN ('descartada','convertida');
END $$;


-- =============================================================================
-- 6. VISTAS
-- =============================================================================

-- El feed: lo accionable, sin duplicados, sin morralla, ordenado por prioridad.
-- Por defecto solo lo que la IA marcó 'relevante' (las dudosas y las sin triar tienen
-- su propia pestaña).
CREATE VIEW v_feed AS
SELECT c.*, o.nombre AS organismo, o.es_objetivo,
       CASE WHEN c.fecha_limite IS NULL THEN NULL
            ELSE ceil(extract(epoch FROM (c.fecha_limite - now())) / 86400)::int END AS dias_restantes
FROM convocatoria c
LEFT JOIN organismo o ON o.id = c.organismo_id
WHERE c.duplicado_de_id IS NULL
  AND c.estado IN ('nueva','en_seguimiento')
  AND c.subtipo NOT IN ('resolucion','informacion_publica')
ORDER BY (c.triage_clasificacion = 'relevante') DESC NULLS LAST,
         o.es_objetivo DESC NULLS LAST, c.score DESC, c.fecha_limite NULLS LAST;

-- Pendientes de triaje IA (cola)
CREATE VIEW v_pendientes_triaje AS
SELECT id, fuente, titulo, organismo_texto, fecha_limite, relevancia, score
FROM convocatoria
WHERE triage_fecha IS NULL AND duplicado_de_id IS NULL
  AND estado IN ('nueva','en_seguimiento')
  AND (fecha_limite IS NULL OR fecha_limite > now())
ORDER BY score DESC;

-- Alertas de plazo: lo que se sigue y cierra en ≤ 7 días
CREATE VIEW v_alertas_plazo AS
SELECT id, fuente, titulo, organismo_texto, fecha_limite, expediente_ref
FROM convocatoria
WHERE estado IN ('en_seguimiento','convertida')
  AND fecha_limite BETWEEN now() AND now() + interval '7 days'
ORDER BY fecha_limite;

-- Posibles duplicados todavía sin marcar (mismo órgano, título parecido, plazo cercano)
CREATE VIEW v_posibles_duplicados AS
SELECT a.id AS id_original, b.id AS id_posible_duplicado,
       a.fuente AS fuente_a, b.fuente AS fuente_b,
       a.titulo AS titulo_a, b.titulo AS titulo_b,
       similarity(a.titulo, b.titulo) AS similitud
FROM convocatoria a
JOIN convocatoria b ON b.id > a.id
 AND b.tipo = a.tipo
 AND b.duplicado_de_id IS NULL AND a.duplicado_de_id IS NULL
 AND (a.organismo_id = b.organismo_id OR a.organismo_id IS NULL OR b.organismo_id IS NULL)
 AND abs(extract(epoch FROM (coalesce(a.fecha_limite, a.created_at)
                            - coalesce(b.fecha_limite, b.created_at)))) < 30 * 86400
 AND a.titulo % b.titulo
WHERE similarity(a.titulo, b.titulo) > 0.55;

-- Salud de las fuentes: última ejecución correcta y alarma si lleva demasiado sin traer nada
CREATE VIEW v_salud_fuentes AS
SELECT f.codigo, f.nombre, f.cron, f.activa,
       max(e.inicio) FILTER (WHERE e.estado = 'ok')    AS ultimo_ok,
       max(e.inicio) FILTER (WHERE e.estado = 'error') AS ultimo_error,
       (SELECT e2.mensaje FROM fuente_ejecucion e2
         WHERE e2.fuente = f.codigo AND e2.estado = 'error' ORDER BY e2.inicio DESC LIMIT 1) AS ultimo_mensaje_error,
       (SELECT count(*) FROM convocatoria c
         WHERE c.fuente = f.codigo AND c.created_at > now() - interval '30 days') AS nuevas_30_dias,
       CASE WHEN f.activa AND coalesce(max(e.inicio) FILTER (WHERE e.estado = 'ok'), '-infinity')
                              < now() - interval '8 days' THEN true ELSE false END AS estancada
FROM fuente f
LEFT JOIN fuente_ejecucion e ON e.fuente = f.codigo
GROUP BY f.codigo;

-- Acierto del triaje IA frente a lo que decide el equipo
CREATE VIEW v_acierto_triaje AS
SELECT triage_clasificacion,
       count(*)                                                   AS total,
       count(*) FILTER (WHERE estado IN ('en_seguimiento','convertida')) AS seguidas,
       count(*) FILTER (WHERE estado = 'descartada')              AS descartadas_a_mano
FROM convocatoria
WHERE triage_fecha IS NOT NULL
GROUP BY triage_clasificacion;

-- Competencia: quién gana en cada organismo y cuántos licitadores suele haber
CREATE VIEW v_competencia_organismo AS
SELECT coalesce(o.nombre, a.organismo_texto)       AS organismo,
       a.adjudicatario_nombre,
       count(*)                                     AS adjudicaciones,
       sum(a.importe_adjudicado_sin_impuestos)      AS importe_total,
       round(avg(a.numero_licitadores), 1)          AS licitadores_medios,
       round(avg(a.importe_adjudicado_sin_impuestos / nullif(a.presupuesto_sin_impuestos, 0)), 3)
                                                    AS ratio_baja_medio
FROM adjudicacion_mercado a
LEFT JOIN organismo o ON o.id = a.organismo_id
GROUP BY 1, 2;


-- =============================================================================
-- 7. DATOS SEMILLA
-- =============================================================================

INSERT INTO motivo_descarte VALUES
    ('sector_incorrecto',    'Sector que no trabajamos'),
    ('producto_no_ofrecido', 'Servicio o producto que no ofrecemos'),
    ('no_elegible',          'No cumplimos los requisitos'),
    ('cliente_no_elegible',  'Ningún cliente nuestro es elegible'),
    ('importe_bajo',         'Importe demasiado bajo'),
    ('organismo',            'Administración u organismo que no nos interesa'),
    ('geografia',            'Ámbito geográfico fuera de nuestro alcance'),
    ('ya_conocida',          'Ya la teníamos en seguimiento'),
    ('duplicada',            'Duplicada o muy similar a otra'),
    ('resolucion_concesion', 'Es una resolución/adjudicación (ya cerrada)'),
    ('plazo_vencido',        'El plazo de presentación ya ha terminado'),
    ('sin_fecha',            'Sin fecha límite ni información suficiente para evaluar vigencia'),
    ('no_es_convocatoria',   'Anuncio informativo, consulta preliminar o RFI'),
    ('otro',                 'Otro motivo');

-- Fuentes del ERP actual y su planificación (cron: min hora día mes día_semana)
INSERT INTO fuente (codigo, nombre, pais, tipo_principal, cron, captura_cpv, captura_pliegos, traduce, es_ia) VALUES
 -- España
 ('PLACE',        'Plataforma de Contratación del Sector Público',       'ES', 'licitacion', '30 8 * * *',       false, true,  false, false),
 ('PUERTOSES',    'Perfiles de contratante de Puertos del Estado y APs',  'ES', 'licitacion', '40 8 * * 1-5',     true,  false, false, false),
 ('BOE',          'Boletín Oficial del Estado',                         'ES', 'ambos',      '0 9 * * 1-5',      false, false, false, false),
 ('BDNS',         'Base de Datos Nacional de Subvenciones',             'ES', 'subvencion', '0 8 * * *',        false, false, false, false),
 ('BOC',          'Boletín Oficial de Canarias',                        'ES', 'subvencion', '15 8 * * 1-5',     false, false, false, false),
 ('CDTI',         'CDTI — convocatorias',                               'ES', 'subvencion', '0 10 * * 1-5',     false, false, false, false),
 ('CDTIWATCH',    'CDTI — calendario y novedades',                      'ES', 'subvencion', '45 8 * * 1-5',     false, false, false, false),
 ('CAT',          'Plataforma de contratación de Cataluña',             'ES', 'licitacion', NULL,               false, false, false, false),
 ('MAD',          'Portal de contratación de Madrid',                   'ES', 'licitacion', NULL,               false, false, false, false),
 ('CAT-SUB',      'Ayudas de la Generalitat de Cataluña',               'ES', 'subvencion', NULL,               false, false, false, false),
 ('CYL-SUB',      'Ayudas de Castilla y León',                          'ES', 'subvencion', NULL,               false, false, false, false),
 ('BORME',        'Boletín Oficial del Registro Mercantil',             'ES', 'aviso',      '20 8 * * 1-5',     false, false, false, false),
 -- Europa
 ('TED',          'Tenders Electronic Daily (DOUE)',                    NULL, 'licitacion', '30 9 * * 1-5',     true,  false, true,  false),
 ('TEDPORTS',     'TED — filtro puertos y marítimo',                    NULL, 'licitacion', '0 10 * * 1-5',     true,  false, true,  false),
 ('EUGRANTS',     'EU Funding & Tenders Portal',                        NULL, 'subvencion', '0 10 * * 1-5',     false, false, false, false),
 ('HORIZONEU',    'Horizonte Europa',                                   NULL, 'subvencion', NULL,               false, false, false, false),
 ('EIC',          'European Innovation Council',                        NULL, 'subvencion', NULL,               false, false, false, false),
 ('EUREKA',       'EUREKA (Eurostars, Globalstars, Innowwide)',         NULL, 'subvencion', '20 9 * * 1,3,5',   false, false, false, false),
 ('NLNET',        'NLnet Foundation',                                   'NL', 'subvencion', '0 13 * * 1,4',     false, false, false, false),
 ('PROTOFUND',    'Prototype Fund',                                     'DE', 'subvencion', '15 13 * * 1,4',    false, false, false, false),
 ('BOAMP',        'BOAMP (Francia)',                                    'FR', 'licitacion', '0 11 * * 1-5',     true,  false, true,  false),
 ('DE',           'Licitaciones de Alemania',                           'DE', 'licitacion', '45 6 * * 2',       true,  false, true,  false),
 ('IT',           'Licitaciones de Italia',                             'IT', 'licitacion', '30 6 * * 3',       true,  false, true,  false),
 ('NL',           'TenderNed (Países Bajos)',                           'NL', 'licitacion', '0 5 * * 4',        false, false, true,  false),
 ('UKFTS',        'Find a Tender Service (Reino Unido)',                'GB', 'licitacion', '45 9 * * 1,3,5',   true,  false, false, false),
 -- América
 ('SAMGOV',       'SAM.gov (EE. UU.)',                                  'US', 'licitacion', '0 10 * * 3',       false, false, true,  false),
 ('CANADA',       'CanadaBuys',                                         'CA', 'licitacion', '0 6 * * 1,4',      false, false, true,  false),
 ('SECOP',        'SECOP (Colombia)',                                   'CO', 'licitacion', '30 11 * * 2,4',    false, false, false, false),
 ('AR',           'Compras públicas de Argentina',                      'AR', 'licitacion', '15 11 * * 1,3',    false, false, false, false),
 ('BR',           'Compras públicas de Brasil',                         'BR', 'licitacion', '30 5 * * 1',       false, false, true,  false),
 ('CR',           'SICOP (Costa Rica)',                                 'CR', 'licitacion', '15 6 * * 1,4',     false, false, false, false),
 ('PA-ACP',       'Autoridad del Canal de Panamá',                      'PA', 'licitacion', '30 12 * * 1,4',    false, false, false, false),
 ('GUATECOMPRAS', 'Guatecompras (Guatemala)',                           'GT', 'licitacion', '0 4 * * 6',        false, false, false, false),
 ('HN',           'HonduCompras (Honduras)',                            'HN', 'licitacion', '0 5 * * 5',        false, false, false, false),
 ('DGCP-RD',      'Compras públicas de República Dominicana',           'DO', 'licitacion', '0 5 * * 2',        false, false, false, false),
 ('SERCOP-EC',    'SERCOP (Ecuador)',                                   'EC', 'licitacion', '0 5 * * 3',        false, false, false, false),
 ('PE',           'SEACE (Perú)',                                       'PE', 'licitacion', '0 3 * * 0',        false, false, false, false),
 ('PY',           'Contrataciones públicas de Paraguay',                'PY', 'licitacion', '0 4 * * 0',        false, false, false, false),
 -- Asia / Oriente Medio
 ('JP',           'Licitaciones de Japón',                              'JP', 'licitacion', '0 6 * * 2',        false, false, true,  false),
 ('COREA',        'KONEPS (Corea del Sur)',                             'KR', 'licitacion', '30 11 * * 1,4',    false, false, true,  false),
 ('IL',           'Licitaciones de Israel',                             'IL', 'licitacion', '0 12 * * 1,4',     false, false, true,  false),
 ('PH',           'PhilGEPS (Filipinas)',                               'PH', 'licitacion', '15 12 * * 1,4',    false, false, false, false),
 ('MWANI-QA',     'Mwani Qatar (puertos de Catar)',                     'QA', 'licitacion', '45 12 * * 1,4',    false, false, false, false),
 -- Multilaterales
 ('WORLDBANK',    'Banco Mundial',                                      NULL, 'licitacion', '30 10 * * 2',      false, false, false, false),
 ('IADB',         'Banco Interamericano de Desarrollo',                 NULL, 'licitacion', '0 11 * * 1,4',     false, false, false, false),
 ('AFDB',         'Banco Africano de Desarrollo',                       NULL, 'licitacion', '30 11 * * 3',      false, false, false, false),
 ('ADB',          'Banco Asiático de Desarrollo',                       NULL, 'licitacion', '30 10 * * 5',      false, false, false, false),
 ('EBRD',         'Banco Europeo de Reconstrucción y Desarrollo',       NULL, 'licitacion', '45 10 * * 2',      false, false, false, false),
 ('OCDS',         'OCDS internacional',                                 NULL, 'licitacion', NULL,               true,  false, true,  false),
 -- Descubrimiento con IA (búsqueda web) y alta manual
 ('IA-SUBVENCION','Descubrimiento IA — subvenciones',                   NULL, 'subvencion', '0 7 * * 1,4',      false, false, false, true),
 ('IA-LICITACION','Descubrimiento IA — licitaciones',                   NULL, 'licitacion', '10 7 * * 1,4',     false, false, false, true),
 ('MANUAL',       'Alta manual',                                        NULL, 'ambos',      NULL,               false, false, false, false);

-- Palabras clave (las del ERP actual). Las de programas propios son ancla: entran
-- como relevantes sin necesidad de otro término marítimo.
INSERT INTO palabra_clave (keyword, categoria, es_ancla) VALUES
    ('Canarias Aporta','programas-financiacion',true), ('EATIC','programas-financiacion',true),
    ('INTERCONNECTA STEP','programas-financiacion',true), ('Activa Startups','programas-financiacion',true),
    ('Ultima Milla','programas-financiacion',true), ('PRACTICATE','programas-financiacion',true),
    ('Innobonos','programas-financiacion',true), ('Neotec','programas-financiacion',true),
    ('Espacios de Datos','programas-financiacion',true), ('Kit Consulting','programas-financiacion',true),
    ('Ports 4.0','programas-financiacion',true), ('PROEXCA','programas-financiacion',true),
    ('ACIISI','programas-financiacion',true), ('RIS3 Canarias','programas-financiacion',true),
    ('CEF-T','programas-financiacion',true);

INSERT INTO palabra_clave (keyword, categoria) VALUES
    -- Subvenciones
    ('innovación portuaria','subvenciones'), ('digitalización marítima','subvenciones'),
    ('I+D marino','subvenciones'), ('I+D+i marítimo','subvenciones'), ('PEICTI','subvenciones'),
    ('CDTI premios','subvenciones'), ('Horizon Europe','subvenciones'), ('CEF Transport','subvenciones'),
    ('EMFAF','subvenciones'), ('InvestEU','subvenciones'), ('Digital Europe Programme','subvenciones'),
    ('blue economy','subvenciones'), ('economia azul','subvenciones'),
    ('maritime innovation','subvenciones'), ('innovación marítima','subvenciones'),
    ('maritime research','subvenciones'),
    -- Licitaciones
    ('digitalización portuaria','licitaciones'), ('sistema de gestión portuaria','licitaciones'),
    ('plataforma portuaria','licitaciones'), ('sistema VTS','licitaciones'),
    ('supervisión marítima','licitaciones'), ('software portuario','licitaciones'),
    ('sistema integrado portuario','licitaciones'),
    ('software de control de accesos portuario','licitaciones'),
    ('port management','licitaciones'), ('vessel traffic','licitaciones'),
    ('maritime traffic management','licitaciones'), ('harbour management system','licitaciones'),
    ('maritime safety system','licitaciones'), ('coastal surveillance','licitaciones'),
    ('port authority system','licitaciones'), ('marine traffic','licitaciones'),
    ('port logistics','licitaciones'),
    -- Marítimo-portuario
    ('puerto','maritimo-portuario'), ('portuario','maritimo-portuario'), ('marítimo','maritimo-portuario'),
    ('náutico','maritimo-portuario'), ('smart port','maritimo-portuario'),
    ('logística marítima','maritimo-portuario'), ('Puertos del Estado','maritimo-portuario'),
    ('autoridad portuaria','maritimo-portuario'), ('terminal portuaria','maritimo-portuario'),
    ('shipping','maritimo-portuario'), ('maritime','maritimo-portuario'),
    ('port digitalization','maritimo-portuario'), ('coastal','maritimo-portuario'),
    ('naval','maritimo-portuario'), ('buque','maritimo-portuario'), ('navío','maritimo-portuario'),
    ('embarcación','maritimo-portuario'), ('plataforma naval','maritimo-portuario'),
    ('plataforma marítima','maritimo-portuario'), ('autónomo naval','maritimo-portuario'),
    ('vehículo autónomo marino','maritimo-portuario'), ('unmanned vessel','maritimo-portuario'),
    ('USV','maritimo-portuario'), ('UUV','maritimo-portuario'), ('dron marino','maritimo-portuario'),
    ('Amura Port','maritimo-portuario'), ('gestión de remolcadores','maritimo-portuario'),
    ('ERP portuario','maritimo-portuario'), ('plataforma de gestión portuaria','maritimo-portuario'),
    ('practicaje','maritimo-portuario'), ('prácticos','maritimo-portuario'),
    ('pilotaje','maritimo-portuario'), ('remolcadores','maritimo-portuario'),
    ('atraque','maritimo-portuario'), ('berthing','maritimo-portuario'), ('mooring','maritimo-portuario'),
    ('amarre','maritimo-portuario'), ('harbour master','maritimo-portuario'), ('VTS','maritimo-portuario'),
    ('tráfico marítimo','maritimo-portuario'), ('AIS','maritimo-portuario'), ('IALA','maritimo-portuario'),
    ('PORTCDM','maritimo-portuario'), ('e-Navigation','maritimo-portuario'), ('STM','maritimo-portuario'),
    ('Sea Traffic Management','maritimo-portuario'), ('gestión de tráfico marítimo','maritimo-portuario'),
    ('control de tráfico portuario','maritimo-portuario'), ('planificación de atraques','maritimo-portuario'),
    ('gestión portuaria','maritimo-portuario'), ('gestión de escalas','maritimo-portuario'),
    ('interoperabilidad marítima','maritimo-portuario'), ('just in time arrival','maritimo-portuario'),
    ('vessel traffic service','maritimo-portuario'), ('gestión activos portuarios','maritimo-portuario'),
    ('port management system','maritimo-portuario'), ('tugboat','maritimo-portuario'),
    ('gestion portuaire','maritimo-portuario'), ('trafic maritime','maritimo-portuario'),
    ('système portuaire','maritimo-portuario'), ('pilotage maritime','maritimo-portuario'),
    ('gestão portuária','maritimo-portuario'), ('praticagem','maritimo-portuario'),
    ('tráfego marítimo','maritimo-portuario'), ('porto marítimo','maritimo-portuario'),
    ('port infrastructure','maritimo-portuario'), ('waterway management','maritimo-portuario'),
    ('maritime transport technology','maritimo-portuario'), ('port modernization','maritimo-portuario'),
    ('maritime digitalization','maritimo-portuario'),
    -- Tecnología digital
    ('IoT marítimo','tecnologia-digital'), ('Edge AI','tecnologia-digital'),
    ('detección de hidrocarburos','tecnologia-digital'), ('gemelo digital','tecnologia-digital'),
    ('digital twin','tecnologia-digital'), ('visión artificial','tecnologia-digital'),
    ('oil spill','tecnologia-digital'), ('ZIDAY','tecnologia-digital'),
    ('procesamiento de imagen','tecnologia-digital'), ('visión por computador','tecnologia-digital'),
    ('maritime autonomous','tecnologia-digital'), ('autonomous vessel','tecnologia-digital'),
    ('maritime IoT','tecnologia-digital'), ('port AI','tecnologia-digital'),
    ('maritime cybersecurity','tecnologia-digital'), ('port cyber security','tecnologia-digital');

-- Empresas del grupo (para avisos BORME)
INSERT INTO empresa_vigilada (nombre, nif, tipo) VALUES
    ('HÍADES BUSINESS PATTERNS SL',     'B76531938', 'grupo'),
    ('PLEYONE MANAGEMENT CAPITAL S.L.', 'B76722404', 'grupo'),
    ('AMURA COGNITIVE SL',              'B70890892', 'grupo'),
    ('AMURA NEUROCOMPUTING SL',         'B70890975', 'grupo');

COMMIT;

-- =============================================================================
-- CRITERIOS DE TRIAJE IA (para el prompt; resumen del que usa el ERP actual)
-- =============================================================================
--  relevante  → encaja con productos/historial: licitación portuaria tecnológica;
--               subvención I+D de las familias en que el grupo presenta (Canarias Aporta,
--               EATIC/RIS3, Innobonos, Neotec, INNTERCONECTA, CEF…); digitalización / IA /
--               datos / ciberseguridad para entorno portuario o marítimo. Plazo NO vencido.
--               El MANTENIMIENTO o EVOLUTIVO de software o sistemas (PMS, VTS/VTMIS, Port
--               Control, GIS, vigilancia, ciberseguridad) de un puerto SÍ es relevante.
--  dudosa     → marítima/portuaria o tecnológica pero con encaje poco claro, o sin datos
--               suficientes. Sistemas de vigilancia, comunicaciones o monitorización
--               marítima de cualquier organismo (Guardia Civil, Armada, SASEMAR,
--               Capitanías…) y el software/sistemas/ENS genéricos de una Autoridad
--               Portuaria son al menos "dudosa".
--  descartada → resolución/adjudicación/lista de beneficiarios; obra civil, dragado,
--               suministro de material o mantenimiento físico aunque sea en un puerto;
--               fuera de sector.
--  Salida: {"clasificacion", "motivo" (una frase), "encaje" 0-100, "ambito",
--           "convocante", "importe"}.
--  [LECCIÓN] El descubrimiento por búsqueda web coló avisos cerrados hace tiempo: una
--  convocatoria concreta sin fecha límite verificable no se guarda (fecha_limite NULL
--  solo si es de ventanilla permanente).
--
-- =============================================================================
-- CONSULTAS DE EJEMPLO
-- =============================================================================
--   SELECT * FROM vigilante.v_feed LIMIT 50;                 -- feed del día
--   SELECT * FROM vigilante.v_pendientes_triaje LIMIT 100;   -- cola para la IA
--   SELECT * FROM vigilante.v_salud_fuentes WHERE estancada; -- scrapers caídos
--   SELECT * FROM vigilante.v_posibles_duplicados;           -- revisar y marcar duplicado_de_id
--   CALL vigilante.mantenimiento_diario();                   -- programar a las 07:15
