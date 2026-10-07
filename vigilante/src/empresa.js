'use strict';

// Datos de una empresa a partir de su NIF: validación y forma jurídica (sin conexión) y,
// con Claude y búsqueda web, CNAE, actividad, domicilio, constitución, plantilla y ventas.

const { crearCliente } = require('./triaje');

// Primera letra del CIF → forma jurídica (Orden EHA/451/2008)
const FORMA_POR_LETRA = {
    A: 'Sociedad anónima', B: 'Sociedad limitada', C: 'Sociedad colectiva', D: 'Sociedad comanditaria',
    E: 'Comunidad de bienes', F: 'Sociedad cooperativa', G: 'Asociación o fundación',
    H: 'Comunidad de propietarios', J: 'Sociedad civil', N: 'Entidad extranjera',
    P: 'Corporación local', Q: 'Organismo público', R: 'Congregación o institución religiosa',
    S: 'Órgano de la Administración', U: 'Unión temporal de empresas', V: 'Otro tipo de entidad',
    W: 'Establecimiento permanente de entidad no residente',
};
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

/**
 * Valida un NIF español (CIF de entidad, DNI o NIE) con su dígito de control.
 * Devuelve { nif, valido, tipo, forma_juridica }.
 */
function validarNif(entrada) {
    const nif = String(entrada || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    const r = { nif, valido: false, tipo: null, forma_juridica: null };
    if (/^\d{8}[A-Z]$/.test(nif)) {
        r.tipo = 'dni';
        r.valido = LETRAS_DNI[Number(nif.slice(0, 8)) % 23] === nif[8];
        r.forma_juridica = 'Persona física (autónomo)';
        return r;
    }
    if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) {
        r.tipo = 'nie';
        const num = `${'XYZ'.indexOf(nif[0])}${nif.slice(1, 8)}`;
        r.valido = LETRAS_DNI[Number(num) % 23] === nif[8];
        r.forma_juridica = 'Persona física (autónomo)';
        return r;
    }
    if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) {
        r.tipo = 'cif';
        r.forma_juridica = FORMA_POR_LETRA[nif[0]];
        const d = nif.slice(1, 8).split('').map(Number);
        let suma = 0;
        d.forEach((n, i) => {
            if (i % 2 === 0) {
                const doble = n * 2;
                suma += Math.floor(doble / 10) + (doble % 10);
            } else {
                suma += n;
            }
        });
        const control = (10 - (suma % 10)) % 10;
        const letra = 'JABCDEFGHI'[control];
        const dado = nif[8];
        if ('PQRSNW'.includes(nif[0])) r.valido = dado === letra;
        else if ('ABEH'.includes(nif[0])) r.valido = dado === String(control);
        else r.valido = dado === String(control) || dado === letra;
    }
    return r;
}

const texto = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const entero = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const numero = { anyOf: [{ type: 'number' }, { type: 'null' }] };

const ESQUEMA_EMPRESA = {
    type: 'object',
    additionalProperties: false,
    required: ['encontrada', 'razon_social', 'cif', 'forma_juridica', 'cnae', 'actividad', 'domicilio',
        'municipio', 'isla', 'fecha_constitucion', 'empleados', 'facturacion', 'anio_datos', 'fuentes', 'avisos'],
    properties: {
        encontrada: { type: 'boolean', description: 'false si no se ha podido identificar la empresa con seguridad.' },
        razon_social: texto,
        cif: texto,
        forma_juridica: texto,
        cnae: {
            type: 'array',
            description: 'Códigos CNAE-2009 de 4 dígitos, el principal primero.',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['codigo', 'descripcion'],
                properties: { codigo: { type: 'string' }, descripcion: { type: 'string' } },
            },
        },
        actividad: { ...texto, description: 'Objeto social o actividad, en una o dos frases.' },
        domicilio: texto,
        municipio: texto,
        isla: { ...texto, description: 'Solo si está en Canarias: Tenerife, Gran Canaria, Lanzarote, Fuerteventura, La Palma, La Gomera o El Hierro.' },
        fecha_constitucion: { ...texto, description: 'AAAA-MM-DD' },
        empleados: entero,
        facturacion: { ...numero, description: 'Ventas del último ejercicio publicado, en euros.' },
        anio_datos: { ...entero, description: 'Ejercicio al que corresponden empleados y facturación.' },
        fuentes: { type: 'array', items: { type: 'string' }, description: 'URLs consultadas que respaldan los datos.' },
        avisos: {
            type: 'array',
            items: { type: 'string' },
            description: 'Discrepancias entre fuentes o datos dudosos (p. ej. dos CNAE distintos).',
        },
    },
};

const INSTRUCCIONES = `Buscas en internet los datos registrales de una empresa española a partir de su NIF o su nombre.
Fuentes útiles: directorios de empresas (einforma, empresia, iberinform, infonif, ranking-empresas de elEconomista,
axesor, infocif), el BORME y la web de la propia empresa. Comprueba que el NIF de la fuente coincide antes de usar
sus datos. No inventes nada: si un dato no aparece, déjalo en null; si las fuentes discrepan (por ejemplo, dos CNAE
distintos), pon los dos en cnae y explícalo en avisos. Responde solo con el JSON pedido, en español.`;

/**
 * Busca los datos de una empresa. Sin ANTHROPIC_API_KEY devuelve solo lo que se deduce
 * del NIF (validez y forma jurídica).
 */
async function buscarDatosEmpresa(config, { cif, razon_social: razonSocial } = {}, { cliente } = {}) {
    const nif = cif ? validarNif(cif) : null;
    const base = {
        cif: nif?.nif || null,
        nif_valido: nif ? nif.valido : null,
        forma_juridica: nif?.forma_juridica || null,
    };
    if (!cif && !razonSocial) throw new Error('Indica el NIF o la razón social');
    if (!config.anthropicApiKey && !cliente) return { ...base, encontrada: false, sin_ia: true, fuentes: [], avisos: [] };

    const anthropic = cliente || crearCliente(config);
    const mensajes = [{
        role: 'user',
        content: [
            nif ? `NIF: ${nif.nif}${nif.valido ? '' : ' (ojo: el dígito de control no cuadra)'}` : null,
            razonSocial ? `Razón social o nombre comercial: ${razonSocial}` : null,
        ].filter(Boolean).join('\n'),
    }];
    let r;
    // La búsqueda web puede pausar el turno: se reanuda hasta 4 veces
    for (let i = 0; i < 5; i++) {
        r = await anthropic.beta.messages.create({
            model: config.modeloTriaje,
            max_tokens: 8000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_EMPRESA } },
            system: INSTRUCCIONES,
            tools: [
                { type: 'web_search_20260209', name: 'web_search', max_uses: 6 },
                { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 },
            ],
            messages: mensajes,
        });
        if (r.stop_reason !== 'pause_turn') break;
        mensajes.push({ role: 'assistant', content: r.content });
    }
    if (r.stop_reason === 'refusal') throw new Error('La IA no pudo buscar esta empresa');
    if (r.stop_reason === 'max_tokens') throw new Error('Respuesta cortada (max_tokens)');
    const bloques = r.content.filter((b) => b.type === 'text');
    const datos = JSON.parse(bloques[bloques.length - 1]?.text || '{}');
    if (datos.fecha_constitucion && !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha_constitucion)) datos.fecha_constitucion = null;
    datos.cnae = (datos.cnae || []).filter((c) => /^\d{2,4}$/.test(String(c.codigo).replace(/\D/g, '')))
        .map((c) => ({ codigo: String(c.codigo).replace(/\D/g, ''), descripcion: c.descripcion }));
    // Lo que se deduce del NIF manda sobre lo que diga la web
    return {
        ...datos,
        cif: base.cif || datos.cif,
        nif_valido: base.nif_valido,
        forma_juridica: datos.forma_juridica || base.forma_juridica,
        modelo: r.model,
    };
}

module.exports = { validarNif, buscarDatosEmpresa, ESQUEMA_EMPRESA, FORMA_POR_LETRA };
