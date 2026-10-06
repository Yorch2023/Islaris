'use strict';

// Análisis en profundidad bajo demanda: Claude lee el anuncio y los pliegos/bases
// (web_fetch sobre las URLs de la convocatoria) y devuelve veredicto, puntuación,
// desglose, requisitos y riesgos, más una nota informativa para clientes en Markdown.

const fs = require('fs');
const { crearCliente, fichaConvocatoria } = require('./triaje');

const texto = { type: 'string' };
const listaTextos = { type: 'array', items: texto };

const ESQUEMA_ANALISIS = {
    type: 'object',
    additionalProperties: false,
    required: ['veredicto', 'puntuacion', 'desglose', 'requisitos', 'riesgos', 'plazos', 'importes',
        'fuentes_leidas', 'resumen_cliente_md'],
    properties: {
        veredicto: { type: 'string', enum: ['presentarse', 'estudiar', 'no_presentarse'] },
        puntuacion: { type: 'integer', description: 'De 0 a 100.' },
        desglose: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['criterio', 'valoracion', 'comentario'],
                properties: {
                    criterio: texto,
                    valoracion: { type: 'string', enum: ['favorable', 'neutro', 'desfavorable'] },
                    comentario: texto,
                },
            },
        },
        requisitos: listaTextos,
        riesgos: listaTextos,
        plazos: listaTextos,
        importes: listaTextos,
        fuentes_leidas: { ...listaTextos, description: 'URLs que se han podido leer de verdad.' },
        resumen_cliente_md: {
            type: 'string',
            description: 'Nota informativa para clientes en Markdown: qué es, a quién va dirigida, '
                + 'importes, plazos y requisitos clave. Sin valoraciones internas.',
        },
    },
};

const INSTRUCCIONES = `Eres el analista de licitaciones y subvenciones del grupo descrito abajo.
Haz un análisis en profundidad de la convocatoria: lee con la herramienta web_fetch el anuncio y,
si están, los pliegos o las bases (solo las URLs que te damos). Basa cada afirmación en lo leído;
si algo no aparece, dilo en vez de suponerlo (por ejemplo, la intensidad de ayuda solo si las bases
la indican). Escribe en español.`;

async function analizar(db, config, id, { cliente } = {}) {
    const { rows } = await db.query('SELECT * FROM convocatoria WHERE id = $1', [id]);
    const c = rows[0];
    if (!c) throw new Error(`No existe la convocatoria ${id}`);
    if (!config.anthropicApiKey && !cliente) throw new Error('Falta ANTHROPIC_API_KEY para el análisis');
    const cli = cliente || crearCliente(config);
    const perfil = fs.readFileSync(config.perfilEmpresa, 'utf8');
    const urls = [c.url_original, c.url_pliego_administrativo, c.url_pliego_tecnico, c.url_bases].filter(Boolean);

    const mensajes = [{
        role: 'user',
        content: `${fichaConvocatoria(c)}\n\nURLs para leer:\n${urls.map((u) => `- ${u}`).join('\n') || '(ninguna)'}`,
    }];
    let respuesta;
    // Las herramientas de servidor pueden pausar el turno: se reanuda hasta 4 veces
    for (let i = 0; i < 5; i++) {
        respuesta = await cli.beta.messages.create({
            model: config.modeloTriaje,
            max_tokens: 16000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA_ANALISIS } },
            system: `${INSTRUCCIONES}\n\n${perfil}`,
            tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 }],
            messages: mensajes,
        });
        if (respuesta.stop_reason !== 'pause_turn') break;
        mensajes.push({ role: 'assistant', content: respuesta.content });
    }
    if (respuesta.stop_reason === 'refusal') throw new Error('La IA no pudo analizar esta convocatoria');
    if (respuesta.stop_reason === 'max_tokens') throw new Error('Respuesta cortada (max_tokens)');
    const bloques = respuesta.content.filter((b) => b.type === 'text');
    const analisis = JSON.parse(bloques[bloques.length - 1]?.text || '{}');
    analisis.puntuacion = Math.max(0, Math.min(100, Math.round(Number(analisis.puntuacion) || 0)));
    analisis.modelo = respuesta.model;

    const { resumen_cliente_md: resumenCliente, ...resto } = analisis;
    await db.query(`
        UPDATE convocatoria SET analisis = $2, analisis_fecha = now(),
               resumen_cliente_md = $3, resumen_cliente_fecha = now()
         WHERE id = $1`, [id, resto, resumenCliente || null]);
    return analisis;
}

module.exports = { analizar, ESQUEMA_ANALISIS };
