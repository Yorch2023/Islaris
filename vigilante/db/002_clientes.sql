-- =============================================================================
--  CLIENTES: fichas de empresa y oportunidades abiertas que les encajan
--
--  El vigilante guarda, además de lo que interesa al grupo, lo que coincide con las
--  palabras clave o el territorio de cada cliente activo. Cada cruce cliente ↔
--  convocatoria lleva un semáforo de encaje (verde / amarillo / rojo) evaluado por la IA,
--  y de ahí sale el paquete que se entrega a la skill islaris-subvenciones.
-- =============================================================================

BEGIN;
SET search_path = vigilante, public;

-- Convocatorias que solo interesan a clientes: no deben aparecer en el feed del grupo
-- ni gastar triaje del grupo.
ALTER TABLE convocatoria ADD COLUMN solo_clientes boolean NOT NULL DEFAULT false;

DROP VIEW v_feed;
CREATE VIEW v_feed AS
SELECT c.*, o.nombre AS organismo, o.es_objetivo,
       CASE WHEN c.fecha_limite IS NULL THEN NULL
            ELSE ceil(extract(epoch FROM (c.fecha_limite - now())) / 86400)::int END AS dias_restantes
FROM convocatoria c
LEFT JOIN organismo o ON o.id = c.organismo_id
WHERE c.duplicado_de_id IS NULL
  AND NOT c.solo_clientes
  AND c.estado IN ('nueva','en_seguimiento')
  AND c.subtipo NOT IN ('resolucion','informacion_publica')
ORDER BY (c.triage_clasificacion = 'relevante') DESC NULLS LAST,
         o.es_objetivo DESC NULLS LAST, c.score DESC, c.fecha_limite NULLS LAST;

DROP VIEW v_pendientes_triaje;
CREATE VIEW v_pendientes_triaje AS
SELECT id, fuente, titulo, organismo_texto, fecha_limite, relevancia, score
FROM convocatoria
WHERE triage_fecha IS NULL AND duplicado_de_id IS NULL
  AND NOT solo_clientes
  AND estado IN ('nueva','en_seguimiento')
  AND (fecha_limite IS NULL OR fecha_limite > now())
ORDER BY score DESC;

CREATE TABLE cliente (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    razon_social         text NOT NULL,
    cif                  text UNIQUE,
    forma_juridica       text,
    isla                 text,
    municipio            text,
    actividad            text,                      -- a qué se dedica
    cnae                 text[],
    empleados            integer CHECK (empleados >= 0),
    facturacion          numeric(14,2),
    fecha_constitucion   date,
    proyecto             text,                      -- qué quiere financiar
    proyecto_importe     numeric(14,2),
    proyecto_plazo       text,
    intereses            text[] NOT NULL DEFAULT '{subvencion}'
                           CHECK (intereses <@ ARRAY['subvencion','licitacion']::text[]),
    minimis_3_anios      numeric(14,2),             -- ayudas de minimis recibidas en 3 años
    al_corriente         boolean,                   -- AEAT, Seguridad Social y ATC
    servicios_licitacion text,                      -- qué vende a la Administración
    certificaciones      text,                      -- ISO, ENS, clasificación…
    -- Lo que el vigilante busca para este cliente
    palabras_clave       text[] NOT NULL DEFAULT '{}',
    territorios          text[] NOT NULL DEFAULT '{}',   -- 'Canarias', 'Tenerife'…
    incluir_territorio   boolean NOT NULL DEFAULT true,  -- todas las ayudas de su territorio
    umbral_aviso         smallint NOT NULL DEFAULT 60 CHECK (umbral_aviso BETWEEN 0 AND 100),
    email_contacto       text,
    notas                text,
    activo               boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER cliente_updated_at BEFORE UPDATE ON cliente
    FOR EACH ROW EXECUTE FUNCTION vigilante.tg_updated_at();

CREATE TABLE cliente_convocatoria (
    cliente_id           bigint NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
    convocatoria_id      bigint NOT NULL REFERENCES convocatoria(id) ON DELETE CASCADE,
    origen               text NOT NULL CHECK (origen IN ('palabra_clave','territorio')),
    coincidencias        text[],
    -- Evaluación de encaje (IA)
    semaforo             text CHECK (semaforo IN ('verde','amarillo','rojo')),
    encaje               smallint CHECK (encaje BETWEEN 0 AND 100),
    motivo               text,
    requisito_critico    text,
    importe_orientativo  text,
    modelo               text,
    evaluado_at          timestamptz,
    -- Decisión del consultor
    estado               text NOT NULL DEFAULT 'sugerida'
                           CHECK (estado IN ('sugerida','en_estudio','propuesta','descartada')),
    avisado_at           timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cliente_id, convocatoria_id)
);
CREATE INDEX cliente_convocatoria_sin_evaluar ON cliente_convocatoria (created_at) WHERE evaluado_at IS NULL;

-- Oportunidades vivas de cada cliente, de mejor a peor encaje
CREATE VIEW v_oportunidades_cliente AS
SELECT cc.*, c.fuente, c.external_id, c.tipo, c.subtipo, c.titulo, c.organismo_texto, c.pais,
       c.fecha_limite, c.ventanilla_permanente, c.presupuesto_sin_impuestos, c.importe_max_ayuda,
       c.valor_estimado, c.moneda, c.url_original, c.url_bases, c.url_pliego_administrativo,
       c.url_pliego_tecnico, c.resumen,
       CASE WHEN c.fecha_limite IS NULL THEN NULL
            ELSE ceil(extract(epoch FROM (c.fecha_limite - now())) / 86400)::int END AS dias_restantes
FROM cliente_convocatoria cc
JOIN convocatoria c ON c.id = cc.convocatoria_id
WHERE c.duplicado_de_id IS NULL
  AND c.estado NOT IN ('vencida','ignorada')
  AND (c.fecha_limite IS NULL OR c.fecha_limite > now());

COMMIT;
