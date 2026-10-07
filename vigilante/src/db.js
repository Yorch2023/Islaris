'use strict';

const os = require('os');
const { Pool, types } = require('pg');

// NUMERIC como string (no perder céntimos) y bigint como número (ids)
types.setTypeParser(20, (v) => parseInt(v, 10));

let pool = null;

/**
 * Si la URL no lleva usuario, se usa el del sistema. Arrancado como servicio (launchd)
 * puede no existir la variable USER, y entonces PostgreSQL rechaza la conexión.
 */
function conUsuario(databaseUrl) {
    try {
        const u = new URL(databaseUrl);
        if (!u.username) u.username = encodeURIComponent(os.userInfo().username);
        return u.toString();
    } catch (_e) {
        return databaseUrl;
    }
}

function obtenerPool(databaseUrl) {
    if (!pool) {
        pool = new Pool({
            connectionString: conUsuario(databaseUrl),
            max: 5,
            options: '-c search_path=vigilante,public -c TimeZone=UTC',
        });
    }
    return pool;
}

async function cerrarPool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

/** Ejecuta fn(client) dentro de una transacción. */
async function enTransaccion(p, fn) {
    const client = await p.connect();
    try {
        await client.query('BEGIN');
        const r = await fn(client);
        await client.query('COMMIT');
        return r;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

module.exports = { obtenerPool, cerrarPool, enTransaccion, conUsuario };
