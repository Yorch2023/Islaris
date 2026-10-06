'use strict';

// Coincidencia de palabras clave y relevancia (alta / media / baja) de una convocatoria.
// La puntuación 0-1000 la calcula la base de datos (vigilante.calcular_score) a partir
// de la relevancia, el plazo, el importe y el número de coincidencias.

const { sinTildes, normalizar } = require('./texto');

// Términos marítimos genéricos ("puerto", "naval"…): uno solo no basta para ser relevante
const GENERICA = 'maritimo-portuario';

const LETRA = '[\\p{L}\\p{N}]';

function escaparRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Siglas como "AIS", "VTS", "USV" o "CEF-T" se buscan respetando mayúsculas para
 * no confundirlas con palabras normales; el resto, sin mayúsculas ni tildes.
 */
function esSigla(keyword) {
    return !/\s/.test(keyword) && keyword.length <= 8 && keyword === keyword.toUpperCase()
        && /[A-Z]/.test(keyword);
}

function compilarPalabras(filas) {
    return filas.map((f) => {
        const sigla = esSigla(f.keyword);
        const base = sigla ? sinTildes(f.keyword) : normalizar(f.keyword);
        const cuerpo = base.split(/\s+/).map(escaparRegex).join('\\s+');
        return {
            id: f.id,
            keyword: f.keyword,
            categoria: f.categoria,
            ancla: Boolean(f.es_ancla),
            sigla,
            regex: new RegExp(`(?<!${LETRA})${cuerpo}(?!${LETRA})`, sigla ? 'u' : 'iu'),
        };
    });
}

function contiene(palabra, texto) {
    return palabra.regex.test(palabra.sigla ? texto.crudo : texto.norm);
}

/**
 * Busca las palabras clave en título y resumen y decide la relevancia:
 *  - alta:  una palabra ancla (programa propio), o dos términos específicos, o uno
 *           específico en el título acompañado de contexto marítimo.
 *  - media: un término específico, o dos términos marítimos genéricos distintos.
 *  - baja:  un único término marítimo genérico.
 * Devuelve null si no coincide nada.
 */
function clasificar({ titulo, resumen }, palabras) {
    const t = { crudo: sinTildes(titulo || ''), norm: normalizar(titulo || '') };
    const r = { crudo: sinTildes(resumen || ''), norm: normalizar(resumen || '') };
    const encontradas = [];
    for (const p of palabras) {
        const enTitulo = contiene(p, t);
        if (enTitulo || contiene(p, r)) encontradas.push({ p, enTitulo });
    }
    if (!encontradas.length) return null;

    const especificas = encontradas.filter((e) => e.p.categoria !== GENERICA);
    const genericas = encontradas.filter((e) => e.p.categoria === GENERICA);
    let relevancia = 'baja';
    if (encontradas.some((e) => e.p.ancla)
        || especificas.length >= 2
        || (especificas.some((e) => e.enTitulo) && genericas.length >= 1)) {
        relevancia = 'alta';
    } else if (especificas.length >= 1 || genericas.length >= 2) {
        relevancia = 'media';
    }
    // Primero las del título y las específicas: son las que explican la relevancia
    encontradas.sort((a, b) => (b.enTitulo - a.enTitulo)
        || ((a.p.categoria === GENERICA) - (b.p.categoria === GENERICA)));
    return { relevancia, coincidencias: encontradas.map((e) => e.p.keyword) };
}

const ORDEN_RELEVANCIA = { baja: 0, media: 1, alta: 2 };

function bajarRelevancia(relevancia) {
    return relevancia === 'alta' ? 'media' : 'baja';
}

module.exports = { compilarPalabras, clasificar, esSigla, bajarRelevancia, ORDEN_RELEVANCIA };
