'use strict';

// BOE: sumario diario de la API de datos abiertos.
// Secciones vigiladas: 3 (Otras disposiciones: convocatorias y bases de ayudas),
// 5A (Contratación del Sector Público) y 5B (Otros anuncios: extractos BDNS).

const { fechaHora, arr, recortar, sumarDias } = require('../texto');

const SECCIONES = new Set(['3', '5A', '5B']);
const ES_AYUDA = /(convoca|ayudas?\b|subvenci|premios?\b|bases reguladoras|extracto|financiaci)/i;

function urlSumario(ymd) {
    return `https://www.boe.es/datosabiertos/api/boe/sumario/${ymd.replace(/-/g, '')}`;
}

/** Recorre departamento → epígrafe → item (cada nivel puede ser objeto o array). */
function* itemsDeSumario(json) {
    const sumario = json?.data?.sumario;
    for (const diario of arr(sumario?.diario)) {
        for (const seccion of arr(diario.seccion)) {
            if (!SECCIONES.has(String(seccion.codigo))) continue;
            for (const dep of arr(seccion.departamento)) {
                for (const item of arr(dep.item)) yield { seccion: String(seccion.codigo), dep, item };
                for (const epi of arr(dep.epigrafe)) {
                    for (const item of arr(epi.item)) yield { seccion: String(seccion.codigo), dep, epi, item };
                }
            }
        }
    }
}

function textoUrl(v) {
    if (!v) return null;
    return typeof v === 'object' ? v.texto || v['#text'] || null : String(v);
}

function aConvocatoria({ seccion, dep, epi, item }, ymd, zona) {
    const tituloCompleto = String(item.titulo || '').trim();
    let tipo;
    if (seccion === '5A') {
        tipo = 'licitacion';
    } else if (ES_AYUDA.test(tituloCompleto)) {
        tipo = 'subvencion';
    } else {
        return null;
    }
    const objeto = tituloCompleto.match(/Objeto:\s*(.+?)(?:\.\s*Expediente:|$)/i)?.[1];
    const expediente = tituloCompleto.match(/Expediente:\s*(\S+?)\.?(?:\s|$)/i)?.[1];
    const bdns = tituloCompleto.match(/BDNS\s*\(Identif\.\)\s*:?\s*(\d+)/i)?.[1];

    return {
        clase: 'convocatoria',
        fuente: 'BOE',
        external_id: String(item.identificador),
        tipo,
        titulo: recortar(objeto || tituloCompleto, 2000),
        organismo_texto: dep?.nombre || null,
        // Los extractos de convocatorias en el BOE llevan el código BDNS: se usa como
        // número de expediente para enlazarlos con la entrada de la BDNS.
        numero_expediente_organo: bdns || expediente || null,
        codigo_bdns: bdns || null,
        pais: 'ES',
        fecha_publicacion: fechaHora(ymd, '00:00:00', zona),
        fecha_limite: null,
        url_original: textoUrl(item.url_html) || textoUrl(item.url_pdf),
        resumen: [epi?.nombre, objeto ? tituloCompleto : null].filter(Boolean).join('\n') || null,
    };
}

async function* leer(ctx) {
    const { desde, hasta, pedir, config, progreso = () => {} } = ctx;
    const totalDias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
    let n = 0;
    for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
        progreso(n++ / totalDias, `sumario del ${dia.split('-').reverse().join('/')} (${n} de ${totalDias})`);
        // 404 = ese día no hay BOE (domingos)
        const json = await pedir(urlSumario(dia), {
            como: 'json', aceptar404: true, cabeceras: { Accept: 'application/json' }, userAgent: config.userAgent,
        });
        if (!json) continue;
        for (const entrada of itemsDeSumario(json)) {
            const c = aConvocatoria(entrada, dia, config.zonaHoraria);
            if (c) yield c;
        }
    }
}

module.exports = { codigo: 'BOE', leer, itemsDeSumario, aConvocatoria, urlSumario };
