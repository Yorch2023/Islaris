'use strict';

const bdns = require('./bdns');
const boe = require('./boe');
const placsp = require('./placsp');
const ted = require('./ted');

// Código de fuente (tabla erp.fuente) → lector
module.exports = {
    BDNS: bdns,
    BOE: boe,
    PLACE: placsp,
    TED: ted,
};
