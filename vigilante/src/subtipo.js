'use strict';

// Qué clase de anuncio es, más allá de subvención/licitación.
// [LECCIÓN del esquema] Consultas preliminares, RFI e información pública no son
// licitaciones aunque vengan del mismo feed; las resoluciones no son oportunidades.

const { normalizar } = require('./texto');

const REGLAS = [
    ['consulta_preliminar', /consulta(s)? preliminar(es)? (de|al) mercado|preliminary market consultation|sourcing consultation/],
    ['rfi', /\brfi\b|request for information|solicitud de informacion/],
    ['informacion_publica', /informacion publica|tramite de audiencia|exposicion publica/],
    ['resolucion', /resolucion .*(se conceden|concede|conced|adjudic|resuelve)|se conceden|relacion de beneficiarios|lista(do)? de (beneficiarios|admitid)|formalizacion del contrato|anuncio de formalizacion|contract award notice|resultado de la licitacion/],
    ['anuncio_previo', /anuncio previo|anuncio de informacion previa|prior information notice/],
];

/** Subtipos que no deben aparecer en el feed: se guardan como 'ignorada'. */
const SUBTIPOS_IGNORADOS = new Set(['resolucion', 'informacion_publica']);

function detectarSubtipo(titulo, pista = null) {
    const t = normalizar(titulo);
    for (const [subtipo, re] of REGLAS) {
        if (re.test(t)) return subtipo;
    }
    return pista || 'convocatoria';
}

module.exports = { detectarSubtipo, SUBTIPOS_IGNORADOS };
