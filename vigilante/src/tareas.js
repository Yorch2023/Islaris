'use strict';

// Ciclos de trabajo: vigilancia + triaje + avisos, mantenimiento diario y el planificador
// que lanza cada fuente según su columna fuente.cron.

const { vigilar } = require('./vigilante');
const { triarPendientes } = require('./triaje');
const { procesarBusquedas } = require('./busquedas');
const { compilarCron, coincide } = require('./cron');
const lectores = require('./fuentes');

const CRON_MANTENIMIENTO = '15 7 * * *';

/** Vigila las fuentes indicadas y, a continuación, tría lo nuevo y envía avisos. */
async function ciclo(db, config, { fuentes, dias, triaje = true, avisos = true, log = console.log } = {}) {
    const resumen = { vigilancia: await vigilar(db, config, { fuentes, dias, log }) };
    if (triaje) resumen.triaje = await triarPendientes(db, config, { log });
    if (avisos) resumen.avisos = await procesarBusquedas(db, config, { log });
    return resumen;
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

module.exports = { ciclo, mantenimiento, iniciarPlanificador, CRON_MANTENIMIENTO };
