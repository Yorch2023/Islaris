'use strict';

// Aplica en orden los ficheros db/NNN_*.sql que aún no se hayan aplicado.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'db');

async function migrar(db, { log = console.log } = {}) {
    await db.query(`CREATE TABLE IF NOT EXISTS public.vigilante_migracion (
        nombre text PRIMARY KEY, aplicada_at timestamptz NOT NULL DEFAULT now())`);
    const aplicadas = new Set((await db.query('SELECT nombre FROM public.vigilante_migracion')).rows.map((r) => r.nombre));
    const ficheros = fs.readdirSync(DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
    const nuevas = [];
    for (const f of ficheros) {
        if (aplicadas.has(f)) continue;
        const client = await db.connect();
        try {
            // Cada fichero gestiona su propia transacción (BEGIN … COMMIT)
            await client.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
            await client.query('INSERT INTO public.vigilante_migracion (nombre) VALUES ($1)', [f]);
            await client.query('SET search_path = vigilante, public');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw new Error(`Error aplicando ${f}: ${e.message}`);
        } finally {
            client.release();
        }
        nuevas.push(f);
        log(`Aplicada ${f}`);
    }
    if (!nuevas.length) log('La base de datos ya está al día');
    return nuevas;
}

module.exports = { migrar };
