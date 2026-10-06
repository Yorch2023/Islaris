'use strict';

// Acceso a la base de datos del vigilante (esquema "vigilante").

const { enTransaccion } = require('./db');
const { normalizar } = require('./texto');

// Organismos que interesan comercialmente: se dan de alta solos y suben en el feed
const ORGANISMO_OBJETIVO = /\b(autoridad portuaria|puertos del estado|port authority|autorite portuaire|autoridade portuaria)\b/;

async function cargarPalabras(db) {
    const { rows } = await db.query(
        'SELECT id, keyword, categoria, es_ancla FROM palabra_clave WHERE activa ORDER BY id');
    return rows;
}

/** Organismos descartados al menos 2 veces con motivo "organismo" (aprendizaje). */
async function organismosVetados(db) {
    const { rows } = await db.query(`
        SELECT organismo_snapshot FROM feedback_descarte
         WHERE motivo = 'organismo' AND organismo_snapshot IS NOT NULL
         GROUP BY organismo_snapshot HAVING count(*) >= 2`);
    return new Set(rows.map((r) => normalizar(r.organismo_snapshot)));
}

async function iniciarEjecucion(db, fuente) {
    const { rows } = await db.query(
        'INSERT INTO fuente_ejecucion (fuente) VALUES ($1) RETURNING id', [fuente]);
    return rows[0].id;
}

async function terminarEjecucion(db, id, { estado, leidas, nuevas, actualizadas, mensaje }) {
    await db.query(`
        UPDATE fuente_ejecucion
           SET fin = now(), estado = $2, leidas = $3, nuevas = $4, actualizadas = $5, mensaje = $6
         WHERE id = $1`, [id, estado, leidas, nuevas, actualizadas, mensaje ?? null]);
}

/**
 * Busca el organismo por DIR3, NIF o alias/nombre. Lo crea si viene con identificador
 * oficial (DIR3/NIF) o si es un organismo objetivo (autoridades portuarias).
 */
async function resolverOrganismo(client, { organismo_texto: texto, organismo_dir3: dir3,
    organismo_nif: nif, pais }) {
    let id = null;
    if (dir3) id = (await client.query('SELECT id FROM organismo WHERE dir3 = $1', [dir3])).rows[0]?.id;
    if (!id && nif) id = (await client.query('SELECT id FROM organismo WHERE nif = $1', [nif])).rows[0]?.id;
    if (!id && texto) {
        id = (await client.query(`
            SELECT organismo_id AS id FROM organismo_alias
             WHERE lower(vigilante.f_unaccent(alias)) = lower(vigilante.f_unaccent($1))
            UNION ALL
            SELECT id FROM organismo WHERE lower(vigilante.f_unaccent(nombre)) = lower(vigilante.f_unaccent($1))
            LIMIT 1`, [texto])).rows[0]?.id;
    }
    const objetivo = Boolean(texto) && ORGANISMO_OBJETIVO.test(normalizar(texto));
    if (!id && objetivo) {
        // "Presidencia de la Autoridad Portuaria de X" = "Autoridad Portuaria de X"
        id = (await client.query(`
            SELECT id FROM organismo
             WHERE es_objetivo
               AND ((' ' || lower(vigilante.f_unaccent($1)) || ' ') LIKE '% ' || lower(vigilante.f_unaccent(nombre)) || ' %'
                 OR (' ' || lower(vigilante.f_unaccent(nombre)) || ' ') LIKE '% ' || lower(vigilante.f_unaccent($1)) || ' %')
             ORDER BY length(nombre) DESC LIMIT 1`, [texto])).rows[0]?.id;
    }
    if (!id && texto && (dir3 || nif || objetivo)) {
        const ins = await client.query(`
            INSERT INTO organismo (nombre, nif, dir3, tipo, pais, es_objetivo)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING RETURNING id`,
        [texto, nif || null, dir3 || null, objetivo ? 'portuario' : null, pais || 'ES', objetivo]);
        id = ins.rows[0]?.id;
        if (!id) {
            id = (await client.query('SELECT id FROM organismo WHERE dir3 = $1 OR nif = $2 LIMIT 1',
                [dir3 || null, nif || null])).rows[0]?.id ?? null;
        }
    }
    if (id && texto) {
        await client.query(
            'INSERT INTO organismo_alias (organismo_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, texto]);
    }
    return id ?? null;
}

/**
 * Original del que esta convocatoria es duplicado (el mismo anuncio por otra fuente):
 *  - mismo órgano y mismo número de expediente;
 *  - misma subvención con el mismo código BDNS (BDNS y extracto en el BOE);
 *  - mismo número de expediente y título parecido;
 *  - título casi idéntico con el mismo plazo (PLACSP ↔ TED).
 */
async function buscarOriginal(client, c, organismoId) {
    const { rows } = await client.query(`
        SELECT id FROM convocatoria
         WHERE duplicado_de_id IS NULL
           AND NOT (fuente = $1 AND external_id = $2)
           AND tipo = $3
           AND (
                ($4::text IS NOT NULL AND numero_expediente_organo = $4 AND (
                     (organismo_id IS NOT NULL AND organismo_id = $5)
                  OR ($3 = 'subvencion' AND $4 ~ '^[0-9]{5,7}$')
                  OR similarity(titulo, $6) > 0.5))
             OR (fuente <> $1 AND titulo % $6 AND similarity(titulo, $6) > 0.75
                 AND fecha_limite IS NOT NULL AND $7::timestamptz IS NOT NULL
                 AND abs(extract(epoch FROM (fecha_limite - $7::timestamptz))) < 3 * 86400)
           )
         ORDER BY created_at
         LIMIT 1`,
    [c.fuente, c.external_id, c.tipo, c.numero_expediente_organo || null, organismoId, c.titulo,
        c.fecha_limite || null]);
    return rows[0]?.id ?? null;
}

// Columnas que trae la fuente (las demás son del flujo de revisión y del triaje)
const COLUMNAS = [
    'tipo', 'subtipo', 'titulo', 'titulo_original', 'idioma_original', 'resumen', 'organismo_id',
    'organismo_texto', 'numero_expediente_organo', 'pais', 'ambito', 'cpv', 'fecha_publicacion',
    'fecha_limite', 'ventanilla_permanente', 'presupuesto_sin_impuestos', 'presupuesto_con_impuestos',
    'valor_estimado', 'importe_max_ayuda', 'moneda', 'url_original', 'url_pliego_administrativo',
    'url_pliego_tecnico', 'url_bases', 'keywords_coincidentes', 'relevancia',
];

// Cuando el mismo anuncio llega por varias fuentes, la original debe ser la más completa:
// PLACSP y BDNS traen plazo, importes y pliegos; el BOE solo el anuncio.
const PRIORIDAD_FUENTE = { PLACE: 1, BDNS: 1, PUERTOSES: 2, TED: 2, BOE: 3 };
const prioridad = (f) => PRIORIDAD_FUENTE[f] ?? 2;

/**
 * Si la convocatoria recién insertada viene de una fuente mejor que su original, y la
 * original aún no se ha tocado (sin revisar ni corregir), intercambia los papeles.
 */
async function quizaPromoverComoOriginal(client, nuevaId, fuenteNueva, originalId) {
    const o = (await client.query(
        'SELECT fuente, estado, corregido_manualmente, triage_fecha FROM convocatoria WHERE id = $1',
        [originalId])).rows[0];
    if (!o || o.estado !== 'nueva' || o.corregido_manualmente || o.triage_fecha
        || prioridad(fuenteNueva) >= prioridad(o.fuente)) return;
    await client.query('UPDATE convocatoria SET duplicado_de_id = $1 WHERE duplicado_de_id = $2 AND id <> $1', [nuevaId, originalId]);
    await client.query('UPDATE convocatoria SET duplicado_de_id = $1 WHERE id = $2', [nuevaId, originalId]);
    await client.query('UPDATE convocatoria SET duplicado_de_id = NULL WHERE id = $1', [nuevaId]);
}

// Valor que toma cada columna al actualizar. El título traducido por la IA se conserva
// mientras la fuente siga trayendo el mismo título original.
function valorActualizado(k) {
    if (k === 'titulo') {
        return `CASE WHEN convocatoria.titulo_original IS NOT NULL AND convocatoria.triage_fecha IS NOT NULL
                       AND convocatoria.titulo_original = coalesce(EXCLUDED.titulo_original, EXCLUDED.titulo)
                     THEN convocatoria.titulo ELSE EXCLUDED.titulo END`;
    }
    if (k === 'titulo_original') return 'coalesce(EXCLUDED.titulo_original, convocatoria.titulo_original)';
    if (k === 'ambito') return 'coalesce(EXCLUDED.ambito, convocatoria.ambito)';
    return `EXCLUDED.${k}`;
}

/**
 * Inserta o actualiza una convocatoria. No pisa las corregidas a mano ni toca el estado
 * de revisión ni el triaje. Devuelve 'nueva', 'actualizada' o 'sin_cambios'.
 */
async function guardarConvocatoria(db, c) {
    return enTransaccion(db, async (client) => {
        const organismoId = await resolverOrganismo(client, c);
        const fila = { ...c, organismo_id: organismoId };
        const existente = (await client.query(
            'SELECT id, duplicado_de_id FROM convocatoria WHERE fuente = $1 AND external_id = $2',
            [c.fuente, c.external_id])).rows[0];
        const duplicadoDe = existente?.duplicado_de_id ?? await buscarOriginal(client, c, organismoId);

        const valores = COLUMNAS.map((k) => fila[k] ?? null);
        const params = [c.fuente, c.external_id, ...valores, duplicadoDe, c.estado_inicial];
        const nCol = COLUMNAS.length;
        const sql = `
            INSERT INTO convocatoria (fuente, external_id, ${COLUMNAS.join(', ')}, duplicado_de_id, estado)
            VALUES ($1, $2, ${COLUMNAS.map((_, i) => `$${i + 3}`).join(', ')}, $${nCol + 3}, $${nCol + 4})
            ON CONFLICT (fuente, external_id) DO UPDATE SET
                ${COLUMNAS.map((k) => `${k} = ${valorActualizado(k)}`).join(',\n                ')},
                duplicado_de_id = coalesce(convocatoria.duplicado_de_id, EXCLUDED.duplicado_de_id)
            WHERE NOT convocatoria.corregido_manualmente
              AND (${COLUMNAS.map((k) => `convocatoria.${k}`).join(', ')})
                  IS DISTINCT FROM (${COLUMNAS.map(valorActualizado).join(', ')})
            RETURNING id, (xmax = 0) AS insertada`;
        const { rows } = await client.query(sql, params);
        if (!rows.length) return { resultado: 'sin_cambios', id: existente?.id };

        const id = rows[0].id;
        if (rows[0].insertada && duplicadoDe) await quizaPromoverComoOriginal(client, id, c.fuente, duplicadoDe);
        if (Array.isArray(c.lotes) && c.lotes.length) {
            await client.query('DELETE FROM convocatoria_lote WHERE convocatoria_id = $1', [id]);
            for (const l of c.lotes) {
                await client.query(`
                    INSERT INTO convocatoria_lote (convocatoria_id, numero, descripcion, presupuesto_sin_impuestos, cpv)
                    VALUES ($1, $2, $3, $4, $5) ON CONFLICT (convocatoria_id, numero) DO NOTHING`,
                [id, l.numero, l.descripcion, l.presupuesto_sin_impuestos, l.cpv?.length ? l.cpv : null]);
            }
        }
        return { resultado: rows[0].insertada ? 'nueva' : 'actualizada', id };
    });
}

async function guardarAdjudicacion(db, a) {
    return enTransaccion(db, async (client) => {
        const organismoId = await resolverOrganismo(client, a);
        const base = a.external_id.split('#')[0];
        const convId = (await client.query(
            'SELECT id FROM convocatoria WHERE fuente = $1 AND external_id = $2', [a.fuente, base])).rows[0]?.id;
        const { rows } = await client.query(`
            INSERT INTO adjudicacion_mercado
                (fuente, external_id, convocatoria_id, organismo_id, organismo_texto, titulo, lote,
                 presupuesto_sin_impuestos, importe_adjudicado_sin_impuestos, numero_licitadores,
                 adjudicatario_nombre, adjudicatario_nif, fecha_adjudicacion, keywords_coincidentes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (external_id) DO NOTHING RETURNING id`,
        [a.fuente, a.external_id, convId ?? null, organismoId, a.organismo_texto, a.titulo, a.lote,
            a.presupuesto_sin_impuestos, a.importe_adjudicado_sin_impuestos, a.numero_licitadores,
            a.adjudicatario_nombre, a.adjudicatario_nif, a.fecha_adjudicacion, a.keywords_coincidentes]);
        return rows.length ? 'nueva' : 'sin_cambios';
    });
}

module.exports = {
    cargarPalabras, organismosVetados, iniciarEjecucion, terminarEjecucion, resolverOrganismo,
    buscarOriginal, guardarConvocatoria, guardarAdjudicacion, COLUMNAS,
};
