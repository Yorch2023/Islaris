'use strict';

// Servidor web: API JSON para el feed y la revisión, y la interfaz en public/.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lectores = require('./fuentes');
const { iniciarPlanificador, ciclo } = require('./tareas');
const { analizar } = require('./analisis');
const { triarUna, guardarTriaje, crearCliente } = require('./triaje');
const { detectarSubtipo } = require('./subtipo');
const { sanear, estadoInicial } = require('./vigilante');
const { guardarConvocatoria } = require('./repositorio');

const PUBLICO = path.join(__dirname, '..', 'public');
const TIPOS_MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// Campos que se pueden corregir a mano desde la ficha
const CORREGIBLES = ['titulo', 'tipo', 'subtipo', 'resumen', 'organismo_texto', 'numero_expediente_organo',
    'pais', 'ambito', 'fecha_limite', 'ventanilla_permanente', 'presupuesto_sin_impuestos',
    'presupuesto_con_impuestos', 'valor_estimado', 'importe_max_ayuda', 'moneda', 'url_original',
    'url_pliego_administrativo', 'url_pliego_tecnico', 'url_bases', 'relevancia', 'cpv'];

const ESTADOS_REVISION = new Set(['nueva', 'en_seguimiento', 'descartada', 'archivada', 'convertida']);

class ErrorPeticion extends Error {
    constructor(status, mensaje) {
        super(mensaje);
        this.status = status;
    }
}

function json(res, status, datos) {
    const cuerpo = JSON.stringify(datos);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(cuerpo);
}

async function leerCuerpo(req) {
    let datos = '';
    for await (const trozo of req) {
        datos += trozo;
        if (datos.length > 1e6) throw new ErrorPeticion(413, 'Petición demasiado grande');
    }
    if (!datos) return {};
    try {
        return JSON.parse(datos);
    } catch (_e) {
        throw new ErrorPeticion(400, 'JSON no válido');
    }
}

function tokenValido(req, token) {
    if (!token) return true;
    const h = req.headers.authorization || '';
    const dado = h.startsWith('Bearer ') ? h.slice(7) : '';
    const a = Buffer.from(dado);
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function entero(v, defecto, max) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, max ?? n) : defecto;
}

// Vistas del feed → condición SQL sobre v_feed / convocatoria
const VISTAS = {
    relevantes: { desde: 'v_feed', donde: "triage_clasificacion = 'relevante'" },
    dudosas: { desde: 'v_feed', donde: "triage_clasificacion = 'dudosa'" },
    sin_triar: { desde: 'v_feed', donde: 'triage_fecha IS NULL' },
    descartadas_ia: { desde: 'v_feed', donde: "triage_clasificacion = 'descartada'" },
    todas: { desde: 'v_feed', donde: 'true' },
    seguimiento: { desde: 'c', donde: "c.estado = 'en_seguimiento'" },
    archivo: { desde: 'c', donde: "c.estado IN ('descartada','ignorada','archivada','vencida','convertida')" },
};

async function listarFeed(db, q) {
    const vista = VISTAS[q.get('vista') || 'relevantes'];
    if (!vista) throw new ErrorPeticion(400, 'Vista desconocida');
    const params = [];
    const filtros = [vista.donde];
    const p = (v) => { params.push(v); return `$${params.length}`; };
    if (q.get('tipo')) filtros.push(`tipo = ${p(q.get('tipo'))}`);
    if (q.get('fuente')) filtros.push(`fuente = ${p(q.get('fuente'))}`);
    if (q.get('relevancia')) filtros.push(`relevancia = ${p(q.get('relevancia'))}`);
    if (q.get('ambito')) filtros.push(`ambito = ${p(q.get('ambito'))}`);
    if (q.get('q')) {
        const t = p(q.get('q'));
        filtros.push(`vigilante.f_unaccent(titulo || ' ' || coalesce(organismo_texto, '')) ILIKE '%' || vigilante.f_unaccent(${t}) || '%'`);
    }
    const limite = entero(q.get('limite'), 100, 500);
    const offset = entero(q.get('offset'), 0);
    const columnas = `id, fuente, external_id, tipo, subtipo, titulo, organismo_texto, pais, ambito, fecha_limite,
        presupuesto_sin_impuestos, importe_max_ayuda, valor_estimado, moneda, relevancia, score, estado,
        keywords_coincidentes, triage_clasificacion, triage_encaje, triage_motivo, url_original, created_at`;
    let sql;
    if (vista.desde === 'v_feed') {
        sql = `SELECT ${columnas}, organismo, es_objetivo, dias_restantes FROM v_feed
                WHERE ${filtros.join(' AND ')} LIMIT ${limite} OFFSET ${offset}`;
    } else {
        sql = `SELECT ${columnas.split(',').map((x) => `c.${x.trim()}`).join(', ')}, o.nombre AS organismo, o.es_objetivo,
                      ceil(extract(epoch FROM (c.fecha_limite - now())) / 86400)::int AS dias_restantes
                 FROM convocatoria c LEFT JOIN organismo o ON o.id = c.organismo_id
                WHERE c.duplicado_de_id IS NULL AND ${filtros.join(' AND ')}
                ORDER BY coalesce(c.revisada_at, c.updated_at) DESC LIMIT ${limite} OFFSET ${offset}`;
    }
    const { rows } = await db.query(sql, params);
    return rows;
}

async function contarVistas(db) {
    const { rows } = await db.query(`
        SELECT count(*) FILTER (WHERE triage_clasificacion = 'relevante') AS relevantes,
               count(*) FILTER (WHERE triage_clasificacion = 'dudosa')    AS dudosas,
               count(*) FILTER (WHERE triage_fecha IS NULL)               AS sin_triar,
               count(*) FILTER (WHERE triage_clasificacion = 'descartada') AS descartadas_ia,
               count(*)                                                    AS todas,
               count(*) FILTER (WHERE estado = 'en_seguimiento')           AS seguimiento
          FROM v_feed`);
    return Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v)]));
}

async function ficha(db, id) {
    const c = (await db.query(`
        SELECT c.*, o.nombre AS organismo, o.es_objetivo, d.titulo AS duplicado_de_titulo
          FROM convocatoria c
          LEFT JOIN organismo o ON o.id = c.organismo_id
          LEFT JOIN convocatoria d ON d.id = c.duplicado_de_id
         WHERE c.id = $1`, [id])).rows[0];
    if (!c) throw new ErrorPeticion(404, 'No existe esa convocatoria');
    const [lotes, cambios, duplicados, competencia] = await Promise.all([
        db.query('SELECT * FROM convocatoria_lote WHERE convocatoria_id = $1 ORDER BY numero', [id]),
        db.query('SELECT * FROM convocatoria_cambio WHERE convocatoria_id = $1 ORDER BY created_at DESC LIMIT 50', [id]),
        db.query('SELECT id, fuente, external_id, titulo, url_original FROM convocatoria WHERE duplicado_de_id = $1', [id]),
        c.organismo_id
            ? db.query(`SELECT adjudicatario_nombre, adjudicaciones, importe_total, licitadores_medios, ratio_baja_medio
                          FROM v_competencia_organismo WHERE organismo = $1
                         ORDER BY adjudicaciones DESC LIMIT 10`, [c.organismo])
            : { rows: [] },
    ]);
    return { ...c, lotes: lotes.rows, cambios: cambios.rows, duplicados: duplicados.rows, competencia: competencia.rows };
}

async function revisar(db, id, cuerpo, usuario) {
    const estado = cuerpo.estado;
    if (!ESTADOS_REVISION.has(estado)) throw new ErrorPeticion(400, 'Estado no válido');
    if (estado === 'descartada' && !cuerpo.motivo_descarte) throw new ErrorPeticion(400, 'Para descartar hay que indicar el motivo');
    if (estado === 'convertida' && !cuerpo.expediente_ref) throw new ErrorPeticion(400, 'Indica la referencia del expediente');
    const { rows } = await db.query(`
        UPDATE convocatoria SET estado = $2,
               motivo_descarte = CASE WHEN $2 = 'descartada' THEN $3 ELSE NULL END,
               expediente_ref = CASE WHEN $2 = 'convertida' THEN $4 ELSE expediente_ref END,
               revisada_por = $5, revisada_at = now()
         WHERE id = $1 RETURNING id, estado`,
    [id, estado, cuerpo.motivo_descarte || null, cuerpo.expediente_ref || null, usuario]);
    if (!rows.length) throw new ErrorPeticion(404, 'No existe esa convocatoria');
    if (estado === 'descartada' && cuerpo.detalle) {
        // El trigger crea el feedback; aquí se completa con el comentario
        await db.query(`
            UPDATE feedback_descarte SET detalle = $2
             WHERE id = (SELECT max(id) FROM feedback_descarte WHERE convocatoria_id = $1)`, [id, cuerpo.detalle]);
    }
    return rows[0];
}

async function corregir(db, id, cuerpo) {
    const campos = Object.keys(cuerpo).filter((k) => CORREGIBLES.includes(k));
    if (!campos.length) throw new ErrorPeticion(400, 'No hay campos corregibles');
    const actual = (await db.query('SELECT * FROM convocatoria WHERE id = $1', [id])).rows[0];
    if (!actual) throw new ErrorPeticion(404, 'No existe esa convocatoria');
    const sets = campos.map((k, i) => `${k} = $${i + 2}`);
    const valores = campos.map((k) => (cuerpo[k] === '' ? null : cuerpo[k]));
    await db.query(`UPDATE convocatoria SET ${sets.join(', ')}, corregido_manualmente = true WHERE id = $1`, [id, ...valores]);
    for (const k of campos) {
        await db.query(`
            INSERT INTO convocatoria_cambio (convocatoria_id, campo, valor_anterior, valor_nuevo, origen)
            VALUES ($1, $2, $3, $4, 'usuario')`,
        [id, k, actual[k] === null ? null : String(actual[k]), cuerpo[k] === null ? null : String(cuerpo[k])]);
    }
    return ficha(db, id);
}

async function altaManual(db, cuerpo) {
    if (!cuerpo.titulo || !cuerpo.tipo) throw new ErrorPeticion(400, 'Faltan título y tipo');
    if (!cuerpo.fecha_limite && !cuerpo.ventanilla_permanente) {
        // [LECCIÓN del esquema] sin fecha verificable solo si es de ventanilla permanente
        throw new ErrorPeticion(400, 'Indica la fecha límite o marca ventanilla permanente');
    }
    const c = sanear({
        ...Object.fromEntries(CORREGIBLES.map((k) => [k, cuerpo[k] ?? null])),
        fuente: 'MANUAL',
        external_id: cuerpo.external_id || `MAN-${Date.now()}`,
        relevancia: cuerpo.relevancia || 'media',
        keywords_coincidentes: null,
    });
    c.subtipo = cuerpo.subtipo || detectarSubtipo(c.titulo);
    c.estado_inicial = estadoInicial(c);
    const r = await guardarConvocatoria(db, c);
    await db.query('UPDATE convocatoria SET corregido_manualmente = true WHERE id = $1', [r.id]);
    return ficha(db, r.id);
}

async function salud(db) {
    const { rows } = await db.query('SELECT * FROM v_salud_fuentes ORDER BY activa DESC, codigo');
    return rows.map((f) => ({ ...f, tiene_lector: Boolean(lectores[f.codigo]), nuevas_30_dias: Number(f.nuevas_30_dias) }));
}

function crearServidor(db, config, { log = console.log, planificador = null } = {}) {
    const ejecuciones = { enMarcha: false, ultimo: null, registro: [] };
    const anotar = (m) => {
        log(m);
        ejecuciones.registro.push(`${new Date().toISOString()} ${m}`);
        if (ejecuciones.registro.length > 200) ejecuciones.registro.shift();
    };

    const rutas = [
        ['GET', /^\/api\/feed$/, (req, q) => listarFeed(db, q)],
        ['GET', /^\/api\/contadores$/, () => contarVistas(db)],
        ['GET', /^\/api\/convocatorias\/(\d+)$/, (req, q, m) => ficha(db, Number(m[1]))],
        ['POST', /^\/api\/convocatorias\/(\d+)\/revision$/, async (req, q, m) =>
            revisar(db, Number(m[1]), await leerCuerpo(req), req.headers['x-usuario'] || null)],
        ['PATCH', /^\/api\/convocatorias\/(\d+)$/, async (req, q, m) => corregir(db, Number(m[1]), await leerCuerpo(req))],
        ['POST', /^\/api\/convocatorias\/(\d+)\/duplicado$/, async (req, q, m) => {
            const { original_id: originalId } = await leerCuerpo(req);
            await db.query('UPDATE convocatoria SET duplicado_de_id = $2 WHERE id = $1', [Number(m[1]), originalId || null]);
            return ficha(db, Number(m[1]));
        }],
        ['POST', /^\/api\/convocatorias\/(\d+)\/analisis$/, (req, q, m) => analizar(db, config, Number(m[1]))],
        ['POST', /^\/api\/convocatorias\/(\d+)\/triaje$/, async (req, q, m) => {
            if (!config.anthropicApiKey) throw new ErrorPeticion(400, 'Falta ANTHROPIC_API_KEY');
            const c = (await db.query('SELECT * FROM convocatoria WHERE id = $1', [Number(m[1])])).rows[0];
            if (!c) throw new ErrorPeticion(404, 'No existe esa convocatoria');
            const perfil = fs.readFileSync(config.perfilEmpresa, 'utf8');
            await guardarTriaje(db, c, await triarUna(crearCliente(config), config, perfil, c));
            return ficha(db, c.id);
        }],
        ['POST', /^\/api\/convocatorias$/, async (req) => altaManual(db, await leerCuerpo(req))],
        ['GET', /^\/api\/salud$/, () => salud(db)],
        ['GET', /^\/api\/alertas$/, async () => (await db.query('SELECT * FROM v_alertas_plazo')).rows],
        ['GET', /^\/api\/duplicados$/, async () => (await db.query('SELECT * FROM v_posibles_duplicados ORDER BY similitud DESC LIMIT 100')).rows],
        ['GET', /^\/api\/acierto$/, async () => (await db.query('SELECT * FROM v_acierto_triaje')).rows],
        ['GET', /^\/api\/competencia$/, async (req, q) => (await db.query(`
            SELECT * FROM v_competencia_organismo
             WHERE $1::text IS NULL OR vigilante.f_unaccent(organismo || ' ' || coalesce(adjudicatario_nombre, ''))
                   ILIKE '%' || vigilante.f_unaccent($1) || '%'
             ORDER BY adjudicaciones DESC LIMIT 200`, [q.get('q') || null])).rows],
        ['GET', /^\/api\/motivos$/, async () => (await db.query('SELECT * FROM motivo_descarte ORDER BY nombre')).rows],
        ['GET', /^\/api\/palabras$/, async () => (await db.query('SELECT * FROM palabra_clave ORDER BY categoria, keyword')).rows],
        ['POST', /^\/api\/palabras$/, async (req) => {
            const b = await leerCuerpo(req);
            const { rows } = await db.query(`
                INSERT INTO palabra_clave (keyword, categoria, es_ancla) VALUES ($1, $2, $3) RETURNING *`,
            [String(b.keyword || '').trim(), b.categoria, Boolean(b.es_ancla)]);
            return rows[0];
        }],
        ['PATCH', /^\/api\/palabras\/(\d+)$/, async (req, q, m) => {
            const b = await leerCuerpo(req);
            const { rows } = await db.query(`
                UPDATE palabra_clave SET activa = coalesce($2, activa), es_ancla = coalesce($3, es_ancla)
                 WHERE id = $1 RETURNING *`, [Number(m[1]), b.activa ?? null, b.es_ancla ?? null]);
            return rows[0] || null;
        }],
        ['DELETE', /^\/api\/palabras\/(\d+)$/, async (req, q, m) => {
            await db.query('DELETE FROM palabra_clave WHERE id = $1', [Number(m[1])]);
            return { ok: true };
        }],
        ['GET', /^\/api\/busquedas$/, async () => (await db.query(`
            SELECT b.*, (SELECT count(*) FROM busqueda_aviso a WHERE a.busqueda_id = b.id)::int AS avisadas
              FROM busqueda_guardada b ORDER BY b.created_at DESC`)).rows],
        ['POST', /^\/api\/busquedas$/, async (req) => {
            const b = await leerCuerpo(req);
            const lista = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
            const { rows } = await db.query(`
                INSERT INTO busqueda_guardada (usuario_email, nombre, q, tipo, fuentes, paises, importe_min,
                    importe_max, encaje_min, cpv_prefijos, notificar_email)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [b.usuario_email, b.nombre, b.q || null, b.tipo || null, lista(b.fuentes), lista(b.paises),
                b.importe_min || null, b.importe_max || null, b.encaje_min ?? null, lista(b.cpv_prefijos),
                b.notificar_email !== false]);
            return rows[0];
        }],
        ['DELETE', /^\/api\/busquedas\/(\d+)$/, async (req, q, m) => {
            await db.query('DELETE FROM busqueda_guardada WHERE id = $1', [Number(m[1])]);
            return { ok: true };
        }],
        ['GET', /^\/api\/ejecucion$/, () => ({ ...ejecuciones, registro: ejecuciones.registro.slice(-50) })],
        ['POST', /^\/api\/ejecucion$/, async (req) => {
            const b = await leerCuerpo(req);
            if (ejecuciones.enMarcha || planificador?.ocupado) throw new ErrorPeticion(409, 'Ya hay una vigilancia en marcha');
            const fuentes = Array.isArray(b.fuentes) && b.fuentes.length ? b.fuentes : config.fuentes;
            ejecuciones.enMarcha = true;
            ciclo(db, config, { fuentes, dias: b.dias ?? config.diasAtras, log: anotar })
                .then((r) => { ejecuciones.ultimo = { fin: new Date(), resumen: r }; })
                .catch((e) => anotar(`Error: ${e.message}`))
                .finally(() => { ejecuciones.enMarcha = false; });
            return { iniciada: true, fuentes };
        }],
        ['GET', /^\/api\/config$/, () => ({
            triaje: Boolean(config.anthropicApiKey), modelo: config.modeloTriaje, email: Boolean(config.smtp?.host),
            fuentes_con_lector: Object.keys(lectores), token: Boolean(config.token),
        })],
    ];

    return http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        try {
            if (url.pathname.startsWith('/api/')) {
                if (!tokenValido(req, config.token)) throw new ErrorPeticion(401, 'Token no válido');
                for (const [metodo, re, fn] of rutas) {
                    const m = url.pathname.match(re);
                    if (m && req.method === metodo) return json(res, 200, await fn(req, url.searchParams, m));
                }
                throw new ErrorPeticion(404, 'Ruta no encontrada');
            }
            if (req.method !== 'GET') throw new ErrorPeticion(405, 'Método no permitido');
            const fichero = path.normalize(path.join(PUBLICO, url.pathname === '/' ? 'index.html' : url.pathname));
            if (!fichero.startsWith(PUBLICO) || !fs.existsSync(fichero) || fs.statSync(fichero).isDirectory()) {
                throw new ErrorPeticion(404, 'No encontrado');
            }
            res.writeHead(200, { 'Content-Type': TIPOS_MIME[path.extname(fichero)] || 'application/octet-stream' });
            fs.createReadStream(fichero).pipe(res);
        } catch (e) {
            const status = e.status || (e.code === '23514' || e.code === '23505' || e.code === '23503' ? 400 : 500);
            if (status === 500) log(`Error en ${req.method} ${url.pathname}: ${e.stack || e.message}`);
            json(res, status, { error: e.message });
        }
    });
}

function arrancar(db, config, { log = console.log } = {}) {
    const planificador = config.planificador === false ? null : iniciarPlanificador(db, config, { log });
    const servidor = crearServidor(db, config, { log, planificador });
    servidor.listen(config.puerto, config.host, () => {
        log(`Vigilante en http://${config.host}:${config.puerto}${config.token ? ' (con token)' : ''}`);
    });
    return { servidor, planificador };
}

module.exports = { crearServidor, arrancar };
