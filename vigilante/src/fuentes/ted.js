'use strict';

// TED (Diario Oficial de la UE, licitaciones europeas e internacionales): API de búsqueda v3.
// La búsqueda se hace por palabras clave en texto completo (FT) dentro del periodo.

const { arr, fechaHora, fechaIso, recortar } = require('../texto');

const URL_BUSQUEDA = 'https://api.ted.europa.eu/v3/notices/search';
const CAMPOS = [
    'publication-number', 'notice-title', 'buyer-name', 'buyer-country', 'publication-date',
    'deadline-receipt-tender-date-lot', 'classification-cpv', 'links',
];
// Categorías de palabra_clave que tiene sentido buscar en licitaciones
// ("cliente": palabras clave de los clientes que buscan licitaciones)
const CATEGORIAS_TED = new Set(['licitaciones', 'maritimo-portuario', 'tecnologia-digital', 'cliente']);
const POR_CONSULTA = 15;

const IDIOMAS = ['spa', 'eng', 'fra', 'por'];
// TED publica el país en ISO 3166-1 alfa-3; el esquema usa alfa-2
const ISO3_A_ISO2 = {
    ESP: 'ES', PRT: 'PT', FRA: 'FR', ITA: 'IT', DEU: 'DE', NLD: 'NL', BEL: 'BE', LUX: 'LU', IRL: 'IE',
    GBR: 'GB', DNK: 'DK', SWE: 'SE', FIN: 'FI', NOR: 'NO', ISL: 'IS', AUT: 'AT', CHE: 'CH', POL: 'PL',
    CZE: 'CZ', SVK: 'SK', HUN: 'HU', SVN: 'SI', HRV: 'HR', ROU: 'RO', BGR: 'BG', GRC: 'GR', CYP: 'CY',
    MLT: 'MT', EST: 'EE', LVA: 'LV', LTU: 'LT', LIE: 'LI', MKD: 'MK', ALB: 'AL', SRB: 'RS', MNE: 'ME',
    BIH: 'BA', TUR: 'TR', UKR: 'UA', MDA: 'MD', GEO: 'GE', MAR: 'MA', TUN: 'TN', EGY: 'EG',
};
const ISO2 = { spa: 'es', eng: 'en', fra: 'fr', por: 'pt' };

/** Elige el texto en español, si no en inglés, si no el primero disponible. */
function multilingue(v) {
    if (!v) return { texto: null, idioma: null };
    if (typeof v === 'string') return { texto: v, idioma: null };
    if (Array.isArray(v)) return multilingue(v[0]);
    for (const k of IDIOMAS) {
        if (v[k]) return { texto: arr(v[k])[0], idioma: k };
    }
    const k = Object.keys(v)[0];
    return k ? { texto: arr(v[k])[0], idioma: k } : { texto: null, idioma: null };
}

function construirConsultas(palabras, desde, hasta) {
    const terminos = palabras.filter((p) => CATEGORIAS_TED.has(p.categoria))
        .map((p) => `FT ~ "${p.keyword.replace(/"/g, '')}"`);
    const consultas = [];
    for (let i = 0; i < terminos.length; i += POR_CONSULTA) {
        consultas.push(`(${terminos.slice(i, i + POR_CONSULTA).join(' OR ')}) AND `
            + `PD >= ${desde.replace(/-/g, '')} AND PD <= ${hasta.replace(/-/g, '')}`);
    }
    return consultas;
}

/** TED titula "País – Categoría – Título": nos quedamos con el título propiamente dicho. */
function limpiarTitulo(t) {
    if (!t) return t;
    const partes = String(t).split(/\s+[–-]\s+/);
    return partes.length >= 3 ? partes.slice(2).join(' – ') : t;
}

function aConvocatoria(n, zona) {
    const pub = n['publication-number'];
    const titulo = multilingue(n['notice-title']);
    const tituloCompleto = titulo.texto;
    titulo.texto = limpiarTitulo(titulo.texto);
    const tituloEs = n['notice-title']?.spa ? limpiarTitulo(arr(n['notice-title'].spa)[0]) : null;
    const comprador = multilingue(n['buyer-name']);
    const plazos = arr(n['deadline-receipt-tender-date-lot']).filter(Boolean).sort();
    const html = n.links?.html || {};
    const url = html.SPA || html.ENG || Object.values(html)[0]
        || (pub ? `https://ted.europa.eu/es/notice/-/detail/${pub}` : null);
    const paisIso3 = arr(n['buyer-country'])[0] || null;
    const pais = paisIso3 ? (ISO3_A_ISO2[paisIso3] || null) : null;
    return {
        clase: 'convocatoria',
        fuente: 'TED',
        external_id: String(pub),
        tipo: 'licitacion',
        titulo: recortar(tituloEs || titulo.texto || String(pub), 2000),
        titulo_original: tituloEs ? null : tituloCompleto,
        idioma_original: tituloEs ? null : (ISO2[titulo.idioma] || null),
        organismo_texto: comprador.texto,
        cpv: [...new Set(arr(n['classification-cpv']).map(String))],
        fecha_publicacion: fechaHora(fechaIso(arr(n['publication-date'])[0]), '00:00:00', zona),
        fecha_limite: plazos[0] ? fechaHora(plazos[0], null, zona) : null,
        url_original: url,
        resumen: [tituloCompleto, paisIso3 ? `País del comprador: ${paisIso3}` : null].filter(Boolean).join('\n'),
        pais,
    };
}

async function* leer(ctx) {
    const { desde, hasta, pedir, config, palabras, progreso = () => {} } = ctx;
    const vistos = new Set();
    const consultas = construirConsultas(palabras, desde, hasta);
    for (const [q, query] of consultas.entries()) {
        progreso(q / consultas.length, `búsqueda ${q + 1} de ${consultas.length}`);
        for (let page = 1; page <= config.tedMaxPaginas; page++) {
            const datos = await pedir(URL_BUSQUEDA, {
                metodo: 'POST',
                como: 'json',
                userAgent: config.userAgent,
                cabeceras: { 'Content-Type': 'application/json', Accept: 'application/json' },
                cuerpo: JSON.stringify({
                    query, fields: CAMPOS, page, limit: 100, scope: 'ACTIVE', paginationMode: 'PAGE_NUMBER',
                }),
            });
            const notices = arr(datos?.notices);
            for (const n of notices) {
                if (!n['publication-number'] || vistos.has(n['publication-number'])) continue;
                vistos.add(n['publication-number']);
                yield aConvocatoria(n, config.zonaHoraria);
            }
            if (notices.length < 100) break;
        }
    }
}

module.exports = { codigo: 'TED', leer, aConvocatoria, construirConsultas, multilingue, limpiarTitulo };
