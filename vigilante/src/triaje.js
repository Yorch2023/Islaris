'use strict';

// Triaje con Claude: relevante / dudosa / descartada, encaje 0-100 y una frase de motivo.
// Las convocatorias con triage_fecha no se vuelven a triar.

const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const ESQUEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['clasificacion', 'motivo', 'encaje', 'ambito', 'convocante', 'importe', 'titulo_es'],
    properties: {
        clasificacion: { type: 'string', enum: ['relevante', 'dudosa', 'descartada'] },
        motivo: { type: 'string', description: 'Una sola frase en español que justifique la clasificación.' },
        encaje: { type: 'integer', description: 'De 0 a 100.' },
        ambito: { type: 'string', enum: ['nacional', 'extranjero'] },
        convocante: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Quién convoca, con su nombre limpio.' },
        importe: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Importe interpretado, en texto (p. ej. "1,2 M€ sin IVA").' },
        titulo_es: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Traducción del título al español si viene en otro idioma; null si ya está en español.',
        },
    },
};

const INSTRUCCIONES = `Eres el analista que hace el triaje del vigilante de convocatorias (subvenciones y licitaciones) de un grupo de empresas.
Para cada convocatoria decides si el equipo debe mirarla, siguiendo el perfil y los criterios de abajo.
Responde solo con el JSON pedido. El motivo es una frase en español, concreta (qué encaja o qué no).
"ambito" es "nacional" si el comprador o convocante es español y "extranjero" en otro caso.
Si un dato no aparece, no lo inventes: usa null.`;

function crearCliente(config) {
    return new Anthropic({ apiKey: config.anthropicApiKey });
}

function fichaConvocatoria(c) {
    const lineas = [
        `Fuente: ${c.fuente}`,
        `Tipo: ${c.tipo}${c.subtipo && c.subtipo !== 'convocatoria' ? ` (${c.subtipo})` : ''}`,
        `Título: ${c.titulo}`,
        c.titulo_original && c.titulo_original !== c.titulo ? `Título original (${c.idioma_original || '?'}): ${c.titulo_original}` : null,
        c.organismo_texto ? `Organismo: ${c.organismo_texto}` : null,
        c.pais ? `País: ${c.pais}` : null,
        c.fecha_limite ? `Fecha límite: ${new Date(c.fecha_limite).toISOString()}` : 'Fecha límite: no publicada',
        c.presupuesto_sin_impuestos ? `Presupuesto sin impuestos: ${c.presupuesto_sin_impuestos} ${c.moneda}` : null,
        c.valor_estimado ? `Valor estimado: ${c.valor_estimado} ${c.moneda}` : null,
        c.importe_max_ayuda ? `Importe de la convocatoria/ayuda: ${c.importe_max_ayuda} ${c.moneda}` : null,
        c.cpv?.length ? `CPV: ${c.cpv.join(', ')}` : null,
        c.keywords_coincidentes?.length ? `Palabras clave que coinciden: ${c.keywords_coincidentes.join(', ')}` : null,
        c.resumen ? `Resumen:\n${c.resumen.slice(0, 4000)}` : null,
    ];
    return lineas.filter(Boolean).join('\n');
}

/** Pide a Claude el triaje de una convocatoria. Devuelve el objeto del esquema. */
async function triarUna(cliente, config, perfil, c) {
    const respuesta = await cliente.beta.messages.create({
        model: config.modeloTriaje,
        max_tokens: 4000,
        // Si la petición se rechaza por política, el servidor reintenta con otro modelo
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: config.esfuerzoTriaje, format: { type: 'json_schema', schema: ESQUEMA } },
        system: [
            { type: 'text', text: `${INSTRUCCIONES}\n\n${perfil}`, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: fichaConvocatoria(c) }],
    });
    if (respuesta.stop_reason === 'refusal') {
        return {
            clasificacion: 'dudosa', encaje: 0, ambito: c.pais && c.pais !== 'ES' ? 'extranjero' : 'nacional',
            motivo: 'La IA no pudo evaluarla: revisar a mano.', convocante: null, importe: null, titulo_es: null,
            modelo: respuesta.model,
        };
    }
    if (respuesta.stop_reason === 'max_tokens') throw new Error('respuesta cortada (max_tokens)');
    const texto = respuesta.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const r = JSON.parse(texto);
    r.encaje = Math.max(0, Math.min(100, Math.round(Number(r.encaje) || 0)));
    r.modelo = respuesta.model;
    return r;
}

async function guardarTriaje(db, c, r) {
    const traducir = r.titulo_es && c.idioma_original && c.idioma_original !== 'es'
        && r.titulo_es.trim() && r.titulo_es.trim() !== c.titulo;
    await db.query(`
        UPDATE convocatoria SET
            triage_clasificacion = $2, triage_encaje = $3, triage_motivo = $4, triage_convocante = $5,
            triage_importe = $6, triage_modelo = $7, triage_fecha = now(),
            ambito = coalesce(ambito, $8),
            titulo_original = CASE WHEN $9 THEN coalesce(titulo_original, titulo) ELSE titulo_original END,
            titulo = CASE WHEN $9 THEN $10 ELSE titulo END
         WHERE id = $1`,
    [c.id, r.clasificacion, r.encaje, r.motivo, r.convocante, r.importe, r.modelo, r.ambito,
        Boolean(traducir), traducir ? r.titulo_es.trim() : null]);
    if (traducir) {
        await db.query(`
            INSERT INTO convocatoria_cambio (convocatoria_id, campo, valor_anterior, valor_nuevo, origen)
            VALUES ($1, 'titulo', $2, $3, 'ia')`, [c.id, c.titulo, r.titulo_es.trim()]);
    }
}

/**
 * Tría la cola v_pendientes_triaje (por puntuación). Devuelve { triadas, errores }.
 * Sin ANTHROPIC_API_KEY no hace nada.
 */
async function triarPendientes(db, config, { limite = config.triajeLote, log = console.log, cliente } = {}) {
    if (!config.anthropicApiKey && !cliente) {
        log('Triaje: falta ANTHROPIC_API_KEY, se omite');
        return { triadas: 0, errores: 0, omitido: true };
    }
    const cli = cliente || crearCliente(config);
    const perfil = fs.readFileSync(config.perfilEmpresa, 'utf8');
    const { rows } = await db.query(`
        SELECT c.* FROM v_pendientes_triaje p JOIN convocatoria c ON c.id = p.id
         ORDER BY p.score DESC LIMIT $1`, [limite]);
    let triadas = 0;
    let errores = 0;
    for (const c of rows) {
        try {
            const r = await triarUna(cli, config, perfil, c);
            await guardarTriaje(db, c, r);
            triadas++;
        } catch (e) {
            errores++;
            log(`Triaje: error en ${c.id} (${c.fuente} ${c.external_id}): ${e.message}`);
        }
    }
    log(`Triaje: ${triadas} triadas, ${errores} con error, ${rows.length} en el lote`);
    return { triadas, errores };
}

module.exports = { triarPendientes, triarUna, guardarTriaje, fichaConvocatoria, crearCliente, ESQUEMA, INSTRUCCIONES };
