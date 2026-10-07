'use strict';

// Búsquedas guardadas: avisa por email de cada convocatoria nueva que cumpla los filtros.
// busqueda_aviso guarda lo ya avisado para no repetir.

const nodemailer = require('nodemailer');

/** Convocatorias que cumplen la búsqueda y aún no se han avisado. */
async function coincidencias(db, b) {
    const { rows } = await db.query(`
        SELECT c.id, c.fuente, c.tipo, c.titulo, c.organismo_texto, c.fecha_limite, c.url_original,
               c.triage_clasificacion, c.triage_encaje, c.triage_motivo, c.score, c.moneda,
               coalesce(c.presupuesto_sin_impuestos, c.importe_max_ayuda, c.valor_estimado) AS importe
          FROM convocatoria c
         WHERE c.duplicado_de_id IS NULL
           AND c.estado IN ('nueva', 'en_seguimiento')
           AND c.created_at >= $1::timestamptz
           AND NOT EXISTS (SELECT 1 FROM busqueda_aviso a WHERE a.busqueda_id = $2 AND a.convocatoria_id = c.id)
           AND ($3::text IS NULL OR vigilante.f_unaccent(c.titulo || ' ' || coalesce(c.organismo_texto, '')
                    || ' ' || coalesce(c.resumen, '')) ILIKE '%' || vigilante.f_unaccent($3) || '%')
           AND ($4::text IS NULL OR c.tipo = $4)
           AND (cardinality(coalesce($5::text[], '{}')) = 0 OR c.fuente = ANY ($5))
           AND (cardinality(coalesce($6::text[], '{}')) = 0 OR c.pais = ANY ($6))
           AND ($7::numeric IS NULL OR coalesce(c.presupuesto_sin_impuestos, c.importe_max_ayuda, c.valor_estimado) >= $7)
           AND ($8::numeric IS NULL OR coalesce(c.presupuesto_sin_impuestos, c.importe_max_ayuda, c.valor_estimado) <= $8)
           AND ($9::smallint IS NULL OR c.triage_encaje >= $9)
           AND (cardinality(coalesce($10::text[], '{}')) = 0 OR EXISTS (
                SELECT 1 FROM unnest(c.cpv) x, unnest($10::text[]) p WHERE x LIKE p || '%'))
         ORDER BY c.score DESC
         LIMIT 200`,
    [b.created_at, b.id, b.q || null, b.tipo || null, b.fuentes, b.paises, b.importe_min, b.importe_max,
        b.encaje_min, b.cpv_prefijos]);
    return rows;
}

function crearTransporte(config) {
    if (!config.smtp?.host) return null;
    return nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
}

function escapar(s) {
    return String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function fmtFecha(f) {
    return f ? new Date(f).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' }) : 'sin plazo';
}

function fmtImporte(v, moneda = 'EUR') {
    return v === null || v === undefined ? '' : Number(v).toLocaleString('es-ES', { style: 'currency', currency: moneda, maximumFractionDigits: 0 });
}

function componerEmail(b, filas) {
    const asunto = `[Radar Financiación] ${filas.length} nueva${filas.length === 1 ? '' : 's'} en "${b.nombre}"`;
    const texto = filas.map((c) => [
        `• ${c.titulo}`,
        `  ${[c.organismo_texto, c.fuente, `plazo: ${fmtFecha(c.fecha_limite)}`, fmtImporte(c.importe, c.moneda)].filter(Boolean).join(' · ')}`,
        c.triage_clasificacion ? `  IA: ${c.triage_clasificacion} (${c.triage_encaje ?? '?'}/100) ${c.triage_motivo || ''}` : null,
        c.url_original ? `  ${c.url_original}` : null,
    ].filter(Boolean).join('\n')).join('\n\n');
    const html = `<p>Nuevas convocatorias para la búsqueda <b>${escapar(b.nombre)}</b>:</p><ul>${filas.map((c) => `
        <li style="margin-bottom:10px"><a href="${escapar(c.url_original)}">${escapar(c.titulo)}</a><br>
        <small>${escapar([c.organismo_texto, c.fuente, `plazo: ${fmtFecha(c.fecha_limite)}`, fmtImporte(c.importe, c.moneda)].filter(Boolean).join(' · '))}</small>
        ${c.triage_clasificacion ? `<br><small>IA: ${escapar(c.triage_clasificacion)} (${c.triage_encaje ?? '?'}/100) ${escapar(c.triage_motivo || '')}</small>` : ''}
        </li>`).join('')}</ul>`;
    return { asunto, texto, html };
}

/** Revisa todas las búsquedas activas, envía los avisos y los registra. */
async function procesarBusquedas(db, config, { log = console.log, transporte } = {}) {
    const trans = transporte === undefined ? crearTransporte(config) : transporte;
    const { rows: busquedas } = await db.query('SELECT * FROM busqueda_guardada WHERE activa ORDER BY id');
    let avisadas = 0;
    for (const b of busquedas) {
        const filas = await coincidencias(db, b);
        if (filas.length && b.notificar_email) {
            if (!trans) {
                log(`Búsqueda "${b.nombre}": ${filas.length} nuevas, pero no hay SMTP configurado (no se marcan como avisadas)`);
                continue;
            }
            const m = componerEmail(b, filas);
            await trans.sendMail({
                from: config.smtp.from, to: b.usuario_email, subject: m.asunto, text: m.texto, html: m.html,
            });
        }
        if (filas.length) {
            await db.query(`
                INSERT INTO busqueda_aviso (busqueda_id, convocatoria_id)
                SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING`, [b.id, filas.map((f) => f.id)]);
            avisadas += filas.length;
            log(`Búsqueda "${b.nombre}": ${filas.length} nuevas${b.notificar_email ? ` avisadas a ${b.usuario_email}` : ''}`);
        }
        await db.query('UPDATE busqueda_guardada SET last_checked_at = now() WHERE id = $1', [b.id]);
    }
    return { busquedas: busquedas.length, avisadas };
}

module.exports = { procesarBusquedas, coincidencias, componerEmail, crearTransporte, escapar, fmtFecha, fmtImporte };
