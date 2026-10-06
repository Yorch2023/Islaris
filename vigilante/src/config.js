'use strict';

// Configuración por variables de entorno (ver .env.example).

const fs = require('fs');
const path = require('path');

/** Carga un fichero .env sencillo (CLAVE=valor) sin pisar variables ya definidas. */
function cargarEnv(fichero = path.join(__dirname, '..', '.env')) {
    if (!fs.existsSync(fichero)) return;
    for (const linea of fs.readFileSync(fichero, 'utf8').split(/\r?\n/)) {
        const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m || process.env[m[1]] !== undefined) continue;
        process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
}

function entero(nombre, defecto) {
    const v = parseInt(process.env[nombre] ?? '', 10);
    return Number.isFinite(v) ? v : defecto;
}

function lista(nombre, defecto) {
    const v = process.env[nombre];
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : defecto;
}

function leerConfig() {
    cargarEnv();
    return {
        databaseUrl: process.env.DATABASE_URL || 'postgres://localhost/vigilante',
        zonaHoraria: process.env.VIGILANTE_ZONA || 'Europe/Madrid',
        // Relevancia mínima (baja | media | alta) para guardar una convocatoria
        relevanciaMinima: ['baja', 'media', 'alta'].includes(process.env.VIGILANTE_RELEVANCIA_MINIMA)
            ? process.env.VIGILANTE_RELEVANCIA_MINIMA : 'baja',
        // Días hacia atrás que se revisan en cada pasada (BOE, BDNS, TED)
        diasAtras: entero('VIGILANTE_DIAS', 3),
        fuentes: lista('VIGILANTE_FUENTES', ['BDNS', 'BOE', 'PLACE', 'TED']),
        placspFeeds: lista('VIGILANTE_PLACSP_FEEDS', [
            // Perfiles de contratante alojados en la Plataforma (AGE, puertos, etc.)
            'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom',
            // Plataformas autonómicas agregadas (incluye Canarias), sin contratos menores
            'https://contrataciondelestado.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom',
        ]),
        placspMaxPaginas: entero('VIGILANTE_PLACSP_MAX_PAGINAS', 20),
        tedMaxPaginas: entero('VIGILANTE_TED_MAX_PAGINAS', 5),
        bdnsMaxPaginas: entero('VIGILANTE_BDNS_MAX_PAGINAS', 40),
        // Triaje con Claude (opcional: sin ANTHROPIC_API_KEY no se hace)
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
        modeloTriaje: process.env.VIGILANTE_MODELO || 'claude-opus-5-5',
        esfuerzoTriaje: process.env.VIGILANTE_ESFUERZO || 'low',
        triajeLote: entero('VIGILANTE_TRIAJE_LOTE', 40),
        perfilEmpresa: process.env.VIGILANTE_PERFIL || path.join(__dirname, '..', 'config', 'perfil-empresa.md'),
        // Servidor web
        host: process.env.VIGILANTE_HOST || '127.0.0.1',
        puerto: entero('VIGILANTE_PUERTO', 3080),
        token: process.env.VIGILANTE_TOKEN || null,
        // Email de las búsquedas guardadas (opcional)
        smtp: {
            host: process.env.SMTP_HOST || null,
            port: entero('SMTP_PORT', 587),
            user: process.env.SMTP_USER || null,
            pass: process.env.SMTP_PASS || null,
            from: process.env.SMTP_FROM || 'Vigilante de convocatorias <no-responder@localhost>',
        },
        userAgent: process.env.VIGILANTE_USER_AGENT || 'Vigilante-Convocatorias/0.1 (+contacto en README)',
    };
}

module.exports = { leerConfig, cargarEnv };
