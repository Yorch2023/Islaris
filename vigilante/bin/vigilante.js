#!/usr/bin/env node
'use strict';

// Línea de comandos del vigilante. Uso: node bin/vigilante.js <orden> [opciones]

const { leerConfig } = require('../src/config');
const { obtenerPool, cerrarPool } = require('../src/db');
const { migrar } = require('../src/migrar');
const { vigilar } = require('../src/vigilante');
const { triarPendientes } = require('../src/triaje');
const { analizar } = require('../src/analisis');
const { procesarBusquedas } = require('../src/busquedas');
const { ciclo, mantenimiento } = require('../src/tareas');
const { arrancar } = require('../src/servidor');

const AYUDA = `Vigilante de subvenciones y licitaciones

Órdenes:
  migrar                      Crea o actualiza el esquema "vigilante" en la base de datos
  vigilar [--fuentes A,B] [--dias N]
                              Lee las fuentes y guarda lo que coincide con las palabras clave
  triaje [--limite N]         Clasifica con Claude lo pendiente (requiere ANTHROPIC_API_KEY)
  avisos                      Envía los avisos de las búsquedas guardadas
  ciclo [--fuentes A,B] [--dias N]
                              vigilar + triaje + avisos (para cron)
  mantenimiento               Caduca lo vencido y recalcula urgencias (diario, 07:15)
  analizar <id>               Análisis en profundidad de una convocatoria
  servidor [--sin-planificador]
                              Interfaz web + planificador según fuente.cron
`;

function opciones(args) {
    const o = { _: [] };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith('--')) {
            const [k, v] = a.slice(2).split('=');
            o[k] = v ?? (args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true);
        } else {
            o._.push(a);
        }
    }
    return o;
}

async function main() {
    const [orden, ...resto] = process.argv.slice(2);
    const o = opciones(resto);
    if (!orden || orden === 'ayuda' || o.help) {
        process.stdout.write(AYUDA);
        return;
    }
    const config = leerConfig();
    const db = obtenerPool(config.databaseUrl);
    const fuentes = typeof o.fuentes === 'string' ? o.fuentes.split(',').map((s) => s.trim().toUpperCase()) : undefined;
    const dias = o.dias !== undefined ? parseInt(o.dias, 10) : undefined;
    let mantenerVivo = false;
    try {
        switch (orden) {
            case 'migrar': await migrar(db); break;
            case 'vigilar': await vigilar(db, config, { fuentes, dias }); break;
            case 'triaje': await triarPendientes(db, config, { limite: o.limite ? parseInt(o.limite, 10) : undefined }); break;
            case 'avisos': await procesarBusquedas(db, config); break;
            case 'ciclo': await ciclo(db, config, { fuentes, dias }); break;
            case 'mantenimiento': await mantenimiento(db); break;
            case 'analizar': {
                const id = parseInt(o._[0], 10);
                if (!id) throw new Error('Indica el id de la convocatoria');
                console.log(JSON.stringify(await analizar(db, config, id), null, 2));
                break;
            }
            case 'servidor':
                arrancar(db, { ...config, planificador: !o['sin-planificador'] });
                mantenerVivo = true;
                break;
            default:
                process.stdout.write(AYUDA);
                process.exitCode = 1;
        }
    } finally {
        if (!mantenerVivo) await cerrarPool();
    }
}

main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
    cerrarPool();
});
