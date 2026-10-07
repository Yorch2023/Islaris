'use strict';

// Ciclos de trabajo: vigilancia + triaje + avisos, mantenimiento diario y el planificador
// que lanza cada fuente según su columna fuente.cron.

const { vigilar } = require('./vigilante');
const { triarPendientes } = require('./triaje');
const { procesarBusquedas } = require('./busquedas');
const { cruzarClientes, evaluarEncajes, avisarClientes, pendientesDeEvaluar } = require('./clientes');
const { compilarCron, coincide } = require('./cron');
const lectores = require('./fuentes');

const CRON_MANTENIMIENTO = '15 7 * * *';

// ---------------------------------------------------------------------------
// Progreso: cada trabajo informa con { porcentaje, fase, detalle } para la barra de la web.
// Un tramo reparte un trabajo dentro de [desde, hasta] del porcentaje total.
// ---------------------------------------------------------------------------
function tramo(progreso, desde, hasta) {
    return (pct, fase, detalle) => progreso({
        porcentaje: Math.round(desde + ((hasta - desde) * Math.max(0, Math.min(100, pct))) / 100), fase, detalle,
    });
}

/** Adapta el progreso por fuente de vigilar() a un porcentaje. */
function progresoVigilancia(avance) {
    let ultimo = { indice: 0, total: 1, fraccion: 0, detalle: '' };
    let leidas = 0;
    return (p) => {
        if (p.leidas !== undefined) leidas = p.leidas;
        else { ultimo = { ...ultimo, ...p }; leidas = 0; }
        const pct = ((ultimo.indice + (ultimo.fraccion || 0)) / ultimo.total) * 100;
        avance(pct, 'Leyendo fuentes', `${ultimo.fuente || ''} (${ultimo.indice + 1} de ${ultimo.total}): ${ultimo.detalle || ''}${leidas ? ` · ${leidas} anuncios revisados` : ''}`);
    };
}

/**
 * Vigila las fuentes indicadas y, a continuación, tría lo nuevo, lo cruza con los
 * clientes y envía los avisos.
 */
async function ciclo(db, config, { fuentes, dias, triaje = true, avisos = true, log = console.log,
    progreso = () => {} } = {}) {
    const resumen = {
        vigilancia: await vigilar(db, config, { fuentes, dias, log, progreso: progresoVigilancia(tramo(progreso, 0, 75)) }),
    };
    if (triaje) {
        tramo(progreso, 75, 85)(0, 'Triaje del grupo con Claude', '');
        resumen.triaje = await triarPendientes(db, config, { log });
    }
    resumen.clientes = await trabajarClientes(db, config, { avisos, log, progreso: (p) => tramo(progreso, 85, 100)(p.porcentaje, p.fase, p.detalle) });
    if (avisos) resumen.avisos = await procesarBusquedas(db, config, { log });
    progreso({ porcentaje: 100, fase: 'Terminado', detalle: '' });
    return resumen;
}

/** Cruza los clientes con lo abierto, evalúa el encaje y avisa por correo. */
async function trabajarClientes(db, config, { clienteId = null, avisos = true, log = console.log,
    progreso = () => {} } = {}) {
    progreso({ porcentaje: 0, fase: 'Cruzando con los clientes', detalle: '' });
    const r = { cruces: await cruzarClientes(db, { clienteId, log }) };
    // Se evalúa por tandas hasta agotar lo pendiente (cada tanda limita el gasto de una pasada)
    r.encaje = { evaluadas: 0, errores: 0 };
    const total = config.anthropicApiKey ? await pendientesDeEvaluar(db, clienteId) : 0;
    const evaluar = tramo(progreso, 10, 95);
    for (let i = 0; i < 20; i++) {
        const hechasAntes = r.encaje.evaluadas + r.encaje.errores;
        const e = await evaluarEncajes(db, config, {
            clienteId, log,
            alAvanzar: (n) => evaluar(total ? ((hechasAntes + n) / total) * 100 : 100,
                'Evaluando el encaje con Claude', `${hechasAntes + n} de ${total} convocatorias`),
        });
        r.encaje.evaluadas += e.evaluadas;
        r.encaje.errores += e.errores;
        if (e.omitido || e.evaluadas === 0 || e.evaluadas + e.errores < (config.encajeLote ?? 60)) break;
    }
    if (avisos) {
        progreso({ porcentaje: 97, fase: 'Enviando avisos', detalle: '' });
        r.avisos = await avisarClientes(db, config, { log });
    }
    progreso({ porcentaje: 100, fase: 'Terminado', detalle: '' });
    return r;
}

/**
 * Para un cliente recién dado de alta: vuelve a leer las fuentes más días hacia atrás
 * (lo que antes no coincidía con nada no estaba guardado) y lo cruza con él.
 */
async function rastrearCliente(db, config, clienteId, { log = console.log, progreso = () => {}, pedirFn } = {}) {
    const cfg = {
        ...config,
        bdnsMaxPaginas: Math.max(config.bdnsMaxPaginas, config.rastreoMaxPaginas),
        placspMaxPaginas: Math.max(config.placspMaxPaginas, 60),
    };
    // Solo las fuentes que sirven a lo que busca el cliente: BDNS para subvenciones,
    // PLACSP y TED para licitaciones, BOE para ambas
    const cliente = (await db.query('SELECT intereses FROM cliente WHERE id = $1', [clienteId])).rows[0];
    const intereses = new Set(cliente?.intereses?.length ? cliente.intereses : ['subvencion']);
    const FUENTE_TIPO = { BDNS: ['subvencion'], PLACE: ['licitacion'], TED: ['licitacion'], BOE: ['subvencion', 'licitacion'] };
    const fuentes = config.fuentes.filter((f) => (FUENTE_TIPO[f] || ['subvencion', 'licitacion']).some((t) => intereses.has(t)));
    // Fuente a fuente: al terminar cada una se cruza con el cliente, para que las
    // oportunidades vayan apareciendo sin esperar a leerlo todo
    const avance = progresoVigilancia(tramo(progreso, 0, 70));
    const vigilancia = {};
    const cruces = {};
    for (const [k, fuente] of fuentes.entries()) {
        Object.assign(vigilancia, await vigilar(db, cfg, {
            fuentes: [fuente], dias: fuente === 'BDNS' ? (config.diasRastreoBdns ?? 365) : config.diasRastreo, log,
            ...(pedirFn ? { pedirFn } : {}),
            progreso: (p) => avance(p.leidas !== undefined ? p : { ...p, indice: k, total: fuentes.length }),
        }));
        const c = await cruzarClientes(db, { clienteId, log });
        cruces[fuente] = c[clienteId] || 0;
    }
    const resto = await trabajarClientes(db, config, {
        clienteId, log, progreso: (p) => tramo(progreso, 70, 100)(p.porcentaje, p.fase, p.detalle),
    });
    return { vigilancia, cruces_por_fuente: cruces, ...resto };
}

async function mantenimiento(db, { log = console.log } = {}) {
    await db.query('CALL vigilante.mantenimiento_diario()');
    log('Mantenimiento diario: vencidas caducadas y urgencias recalculadas');
}

/**
 * Planificador en proceso: cada minuto mira qué fuentes tocan según su cron y las
 * ejecuta (una tanda cada vez; si la anterior sigue en marcha, se encolan).
 */
function iniciarPlanificador(db, config, { log = console.log } = {}) {
    let ocupado = false;
    const cola = new Set();
    let mantenimientoPendiente = false;
    const cronMant = compilarCron(CRON_MANTENIMIENTO);

    async function vaciarCola() {
        if (ocupado || (!cola.size && !mantenimientoPendiente)) return;
        ocupado = true;
        try {
            if (mantenimientoPendiente) {
                mantenimientoPendiente = false;
                await mantenimiento(db, { log });
            }
            if (cola.size) {
                const fuentes = [...cola];
                cola.clear();
                log(`Planificador: ejecutando ${fuentes.join(', ')}`);
                await ciclo(db, config, { fuentes, log });
            }
        } catch (e) {
            log(`Planificador: error: ${e.message}`);
        } finally {
            ocupado = false;
        }
        if (cola.size || mantenimientoPendiente) setImmediate(vaciarCola);
    }

    async function tic() {
        const ahora = new Date();
        try {
            if (coincide(cronMant, ahora, config.zonaHoraria)) mantenimientoPendiente = true;
            const { rows } = await db.query('SELECT codigo, cron FROM fuente WHERE activa AND cron IS NOT NULL');
            for (const f of rows) {
                if (!lectores[f.codigo]) continue;
                try {
                    if (coincide(f.cron, ahora, config.zonaHoraria)) cola.add(f.codigo);
                } catch (e) {
                    log(`Planificador: cron no válido en ${f.codigo}: ${e.message}`);
                }
            }
        } catch (e) {
            log(`Planificador: no se pudo leer la planificación: ${e.message}`);
        }
        vaciarCola();
    }

    // Alinear con el inicio de cada minuto
    let intervalo = null;
    const arranque = setTimeout(() => {
        tic();
        intervalo = setInterval(tic, 60000);
    }, 60000 - (Date.now() % 60000) + 500);
    log('Planificador iniciado (cron por fuente, mantenimiento a las 07:15)');

    return {
        encolar(fuentes) {
            for (const f of fuentes) cola.add(f);
            vaciarCola();
        },
        get ocupado() { return ocupado; },
        parar() {
            clearTimeout(arranque);
            if (intervalo) clearInterval(intervalo);
        },
    };
}

module.exports = { ciclo, trabajarClientes, rastrearCliente, mantenimiento, iniciarPlanificador, CRON_MANTENIMIENTO };
