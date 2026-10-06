'use strict';

// Orquestador: recorre las fuentes, clasifica por palabras clave y guarda en la BD.

const lectores = require('./fuentes');
const repo = require('./repositorio');
const { compilarPalabras, clasificar, bajarRelevancia, ORDEN_RELEVANCIA } = require('./palabras');
const { detectarSubtipo, SUBTIPOS_IGNORADOS } = require('./subtipo');
const { hoyYmd, sumarDias, normalizar } = require('./texto');
const { pedir } = require('./http');

/**
 * Corrige importes que violarían los CHECK del esquema en lugar de perder la convocatoria:
 * si la fuente publica un valor estimado menor que el presupuesto (o un "con impuestos"
 * menor que el "sin impuestos"), el dato dudoso se deja vacío.
 */
function sanear(c) {
    const n = (v) => (v === null || v === undefined ? null : Number(v));
    const sin = n(c.presupuesto_sin_impuestos);
    if (sin !== null && n(c.presupuesto_con_impuestos) !== null && n(c.presupuesto_con_impuestos) < sin) {
        c.presupuesto_con_impuestos = null;
    }
    if (sin !== null && n(c.valor_estimado) !== null && n(c.valor_estimado) < sin) {
        c.valor_estimado = null;
    }
    c.ventanilla_permanente = Boolean(c.ventanilla_permanente);
    if (c.ventanilla_permanente) c.fecha_limite = null;
    if (!c.ambito && c.pais) c.ambito = c.pais === 'ES' ? 'nacional' : 'extranjero';
    c.moneda = c.moneda || 'EUR';
    c.cpv = Array.isArray(c.cpv) && c.cpv.length ? c.cpv : null;
    c.titulo = (c.titulo || '').trim() || `(sin título) ${c.external_id}`;
    return c;
}

/** Estado con el que entra una convocatoria nueva. */
function estadoInicial(c, ahora = new Date()) {
    if (SUBTIPOS_IGNORADOS.has(c.subtipo)) return 'ignorada';
    if (c.fecha_limite && new Date(c.fecha_limite) < ahora) return 'vencida';
    return 'nueva';
}

/**
 * Ejecuta la vigilancia de las fuentes indicadas.
 * @returns resumen por fuente { leidas, nuevas, actualizadas, error? }
 */
async function vigilar(db, config, { fuentes = config.fuentes, dias = config.diasAtras, log = console.log,
    lectoresInyectados = lectores, pedirFn = pedir } = {}) {
    const palabras = compilarPalabras(await repo.cargarPalabras(db));
    const vetados = await repo.organismosVetados(db);
    const activas = new Set((await db.query('SELECT codigo FROM fuente WHERE activa')).rows.map((f) => f.codigo));
    const minimo = ORDEN_RELEVANCIA[config.relevanciaMinima || 'baja'];
    const hasta = hoyYmd(config.zonaHoraria);
    const desde = sumarDias(hasta, -Math.max(0, dias));
    const resumen = {};

    /** Clasifica y decide si la convocatoria merece guardarse. Muta c. */
    const interesa = (c) => {
        const cl = clasificar(c, palabras);
        if (!cl) return false;
        let relevancia = cl.relevancia;
        if (c.organismo_texto && vetados.has(normalizar(c.organismo_texto))) relevancia = bajarRelevancia(relevancia);
        c.relevancia = relevancia;
        c.keywords_coincidentes = cl.coincidencias;
        return ORDEN_RELEVANCIA[relevancia] >= minimo;
    };

    for (const codigo of fuentes) {
        const lector = lectoresInyectados[codigo];
        if (!lector) {
            log(`${codigo}: no hay lector implementado para esta fuente, se omite`);
            continue;
        }
        if (!activas.has(codigo)) {
            log(`${codigo}: la fuente está desactivada o no existe en la tabla fuente, se omite`);
            continue;
        }
        const ejecucion = await repo.iniciarEjecucion(db, codigo);
        const r = { leidas: 0, nuevas: 0, actualizadas: 0, adjudicaciones: 0, errores: 0 };
        resumen[codigo] = r;
        const ctx = {
            desde, hasta, config, palabras, log,
            interesa: (c) => interesa({ ...c }),
            pedir: (url, op) => pedirFn(url, { userAgent: config.userAgent, ...op }),
        };
        let mensaje = null;
        try {
            for await (const item of lector.leer(ctx)) {
                r.leidas++;
                if (!interesa(item)) continue;
                try {
                    if (item.clase === 'adjudicacion') {
                        // Para inteligencia de mercado basta con lo que tiene contexto específico
                        if (item.relevancia === 'baja') continue;
                        if (await repo.guardarAdjudicacion(db, item) === 'nueva') r.adjudicaciones++;
                        continue;
                    }
                    item.subtipo = detectarSubtipo(item.titulo, item.subtipo_pista);
                    sanear(item);
                    item.estado_inicial = estadoInicial(item);
                    const { resultado } = await repo.guardarConvocatoria(db, item);
                    if (resultado === 'nueva') r.nuevas++;
                    else if (resultado === 'actualizada') r.actualizadas++;
                } catch (e) {
                    r.errores++;
                    log(`${codigo}: no se pudo guardar ${item.external_id}: ${e.message}`);
                }
            }
            if (r.errores) mensaje = `${r.errores} elementos no se pudieron guardar`;
            await repo.terminarEjecucion(db, ejecucion, { estado: 'ok', ...r, mensaje });
        } catch (e) {
            r.error = e.message;
            log(`${codigo}: error en la lectura: ${e.message}`);
            await repo.terminarEjecucion(db, ejecucion, { estado: 'error', ...r, mensaje: e.message });
        }
        log(`${codigo}: ${r.leidas} leídas, ${r.nuevas} nuevas, ${r.actualizadas} actualizadas`
            + (r.adjudicaciones ? `, ${r.adjudicaciones} adjudicaciones` : '')
            + (r.error ? ` (ERROR: ${r.error})` : ''));
    }
    return resumen;
}

module.exports = { vigilar, sanear, estadoInicial };
