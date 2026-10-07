#!/usr/bin/env node
'use strict';

// Conector MCP de Radar Financiación - Islaris (el vigilante): da a Claude (app de escritorio) herramientas para dar de alta
// clientes, buscar sus datos por NIF, lanzar la búsqueda de convocatorias, seguir el
// progreso y leer las oportunidades. Lo usa la skill islaris-subvenciones.
//
// Habla con la API web del vigilante, que tiene que estar en marcha
// (node bin/vigilante.js servidor). Configuración: VIGILANTE_URL y VIGILANTE_TOKEN
// (por defecto, http://127.0.0.1:3080 y el token del .env, si lo hay).

const path = require('path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { cargarEnv } = require('../src/config');

cargarEnv(path.join(__dirname, '..', '.env'));

const URL_BASE = (process.env.VIGILANTE_URL
    || `http://${process.env.VIGILANTE_HOST && process.env.VIGILANTE_HOST !== '0.0.0.0' ? process.env.VIGILANTE_HOST : '127.0.0.1'}:${process.env.VIGILANTE_PUERTO || 3080}`)
    .replace(/\/$/, '');
const TOKEN = process.env.VIGILANTE_TOKEN || null;

async function api(ruta, { metodo = 'GET', cuerpo } = {}, fetchFn = fetch) {
    let res;
    try {
        res = await fetchFn(URL_BASE + ruta, {
            method: metodo,
            headers: {
                'Content-Type': 'application/json',
                'X-Usuario': 'Claude (skill Islaris)',
                ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
            },
            body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
            signal: AbortSignal.timeout(180000),
        });
    } catch (e) {
        throw new Error(`Radar Financiación - Islaris no responde en ${URL_BASE} (${e.message}). `
            + 'Comprueba que está arrancado: en la terminal, node bin/vigilante.js servidor.');
    }
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(datos.error || `Error ${res.status} en ${ruta}`);
    return datos;
}

const resultado = (datos) => ({ content: [{ type: 'text', text: typeof datos === 'string' ? datos : JSON.stringify(datos, null, 2) }] });
const error = (e) => ({ isError: true, content: [{ type: 'text', text: e.message }] });
const envolver = (fn) => async (args) => {
    try {
        return resultado(await fn(args || {}));
    } catch (e) {
        return error(e);
    }
};

/** Oportunidades sin los campos largos, para no llenar el contexto. */
function resumirOportunidades(ops) {
    return ops.map((o) => ({
        convocatoria_id: o.convocatoria_id, semaforo: o.semaforo, encaje: o.encaje, estado: o.estado,
        titulo: o.titulo, organismo: o.organismo_texto, tipo: o.tipo, fuente: o.fuente,
        fecha_limite: o.fecha_limite, dias_restantes: o.dias_restantes, ventanilla_permanente: o.ventanilla_permanente,
        importe: o.importe_orientativo || o.presupuesto_sin_impuestos || o.importe_max_ayuda || o.valor_estimado,
        motivo: o.motivo, requisito_critico: o.requisito_critico,
        coincide_por: o.semaforo ? undefined : `${o.origen}: ${(o.coincidencias || []).join(', ')}`,
        url_oficial: o.url_original, url_bases: o.url_bases,
    }));
}

const ISLAS = ['Tenerife', 'Gran Canaria', 'Lanzarote', 'Fuerteventura', 'La Palma', 'La Gomera', 'El Hierro'];

const CAMPOS_CLIENTE = {
    razon_social: z.string().optional().describe('Razón social. Obligatoria al crear.'),
    cif: z.string().optional().describe('NIF o CIF.'),
    forma_juridica: z.string().optional(),
    isla: z.enum(ISLAS).optional(),
    municipio: z.string().optional(),
    actividad: z.string().optional().describe('A qué se dedica, en una o dos frases.'),
    cnae: z.array(z.string()).optional().describe('Códigos CNAE de 4 dígitos.'),
    empleados: z.number().int().optional(),
    facturacion: z.number().optional().describe('Facturación del último ejercicio en euros.'),
    fecha_constitucion: z.string().optional().describe('AAAA-MM-DD'),
    proyecto: z.string().optional().describe('Qué quiere financiar.'),
    proyecto_importe: z.number().optional(),
    proyecto_plazo: z.string().optional(),
    intereses: z.array(z.enum(['subvencion', 'licitacion'])).optional(),
    minimis_3_anios: z.number().optional(),
    al_corriente: z.boolean().optional().describe('Al corriente con AEAT, Seguridad Social y ATC.'),
    servicios_licitacion: z.string().optional(),
    certificaciones: z.string().optional(),
    palabras_clave: z.array(z.string()).optional().describe('Palabras que aparecerían en el título de las convocatorias que le interesan.'),
    territorios: z.array(z.string()).optional().describe('Vacío = Canarias + isla + municipio.'),
    incluir_territorio: z.boolean().optional().describe('Incluir todas las ayudas de su territorio (la IA las filtra).'),
    umbral_aviso: z.number().int().min(0).max(100).optional(),
    email_contacto: z.string().optional(),
    notas: z.string().optional(),
    datos_registro: z.record(z.string(), z.any()).optional().describe('Lo que devolvió buscar_empresa: domicilio, cnae, fuentes, avisos.'),
    ayudas_recibidas: z.record(z.string(), z.any()).optional().describe('El campo "ayudas" que devolvió buscar_empresa.'),
};

function crearServidorMcp({ fetchFn = fetch } = {}) {
    const llamar = (ruta, op) => api(ruta, op, fetchFn);
    const servidor = new McpServer({ name: 'radar-financiacion-islaris', version: '0.2.0' });

    servidor.registerTool('estado_vigilante', {
        title: 'Estado del Radar Financiación',
        description: 'Comprueba que el Radar Financiación está en marcha y si hay una búsqueda en curso, con su porcentaje de avance. '
            + 'Para seguir una búsqueda lanzada con buscar_convocatorias_cliente, llámala con esperar_segundos=45: espera '
            + 'hasta que el avance cambie al menos 10 puntos o termine, y así se puede informar al usuario sin repetir llamadas.',
        inputSchema: { esperar_segundos: z.number().int().min(0).max(50).optional() },
    }, envolver(async ({ esperar_segundos: espera = 0 }) => {
        const config = await llamar('/api/config');
        let ejecucion = await llamar('/api/ejecucion');
        const inicial = ejecucion.progreso?.porcentaje ?? 0;
        const limite = Date.now() + espera * 1000;
        while (ejecucion.enMarcha && Date.now() < limite && (ejecucion.progreso?.porcentaje ?? 0) - inicial < 10) {
            await new Promise((ok) => setTimeout(ok, 3000));
            ejecucion = await llamar('/api/ejecucion');
        }
        return {
            en_marcha: ejecucion.enMarcha || ejecucion.planificador_ocupado,
            trabajo: ejecucion.trabajo, progreso: ejecucion.progreso,
            ultimo: ejecucion.ultimo && { trabajo: ejecucion.ultimo.trabajo, fin: ejecucion.ultimo.fin, error: ejecucion.ultimo.error },
            ia_disponible: config.triaje, email_avisos: config.email_avisos, dias_rastreo: config.dias_rastreo,
            web: URL_BASE,
        };
    }));

    servidor.registerTool('buscar_empresa', {
        title: 'Buscar datos de una empresa por NIF',
        description: 'Valida el NIF, deduce la forma jurídica y busca en internet razón social, CNAE, actividad, domicilio, '
            + 'constitución, plantilla y ventas; además consulta en la BDNS las ayudas que ha recibido y su minimis de los '
            + 'últimos 3 años. No guarda nada: enseña los datos al usuario para que los confirme y luego usa guardar_cliente.',
        inputSchema: { nif: z.string().optional(), razon_social: z.string().optional() },
    }, envolver(({ nif, razon_social: razonSocial }) => llamar('/api/empresa/buscar', {
        metodo: 'POST', cuerpo: { cif: nif, razon_social: razonSocial },
    })));

    servidor.registerTool('listar_clientes', {
        title: 'Listar clientes',
        description: 'Clientes dados de alta en el Radar, con el número de oportunidades verdes y amarillas.',
        inputSchema: {},
    }, envolver(async () => (await llamar('/api/clientes')).map((k) => ({
        cliente_id: k.id, razon_social: k.razon_social, cif: k.cif, activo: k.activo,
        verdes: k.verdes, amarillas: k.amarillas, sin_evaluar: k.sin_evaluar, proximo_plazo: k.proximo_plazo,
    }))));

    servidor.registerTool('ver_cliente', {
        title: 'Ver ficha y oportunidades de un cliente',
        description: 'Ficha completa del cliente y sus oportunidades abiertas (semáforo, encaje, motivo, plazo, enlaces).',
        inputSchema: { cliente_id: z.number().int(), incluir_rojas: z.boolean().optional() },
    }, envolver(async ({ cliente_id: id, incluir_rojas: rojas }) => {
        const k = await llamar(`/api/clientes/${id}`);
        const ops = k.oportunidades.filter((o) => rojas || (o.semaforo !== 'rojo' && o.estado !== 'descartada'));
        const { oportunidades: _o, ...ficha } = k;
        return { ficha, oportunidades: resumirOportunidades(ops) };
    }));

    servidor.registerTool('guardar_cliente', {
        title: 'Crear o actualizar un cliente',
        description: 'Crea la ficha del cliente en el Radar (sin cliente_id) o actualiza la existente (con cliente_id). '
            + 'Al crearla, el Radar la cruza en el momento con las convocatorias que ya conoce. '
            + 'Antes de crear, comprueba con listar_clientes que no exista ya.',
        inputSchema: { cliente_id: z.number().int().optional(), ...CAMPOS_CLIENTE },
    }, envolver(async ({ cliente_id: id, ...campos }) => {
        const k = await llamar(id ? `/api/clientes/${id}` : '/api/clientes', { metodo: id ? 'PATCH' : 'POST', cuerpo: campos });
        return { cliente_id: k.id, razon_social: k.razon_social, oportunidades_ya_encontradas: k.oportunidades.length, web: `${URL_BASE}/#cliente=${k.id}` };
    }));

    servidor.registerTool('sugerir_palabras_clave', {
        title: 'Sugerir palabras clave',
        description: 'Propone palabras clave y territorios para buscar convocatorias de este cliente a partir de su ficha. '
            + 'No las guarda: revísalas con el usuario y guárdalas con guardar_cliente.',
        inputSchema: { cliente_id: z.number().int() },
    }, envolver(({ cliente_id: id }) => llamar(`/api/clientes/${id}/sugerir-palabras`, { metodo: 'POST' })));

    servidor.registerTool('buscar_convocatorias_cliente', {
        title: 'Buscar convocatorias para un cliente',
        description: 'Relee las fuentes (BDNS, BOE, Plataforma de Contratación y TED) de los últimos 90 días buscando para '
            + 'este cliente y evalúa el encaje con semáforo. Tarda varios minutos y corre en segundo plano: después llama a '
            + 'estado_vigilante cada poco para informar del avance y, al terminar, a ver_cliente.',
        inputSchema: { cliente_id: z.number().int() },
    }, envolver(({ cliente_id: id }) => llamar(`/api/clientes/${id}/rastrear`, { metodo: 'POST' })));

    servidor.registerTool('evaluar_encaje_cliente', {
        title: 'Evaluar el encaje pendiente',
        description: 'Pone semáforo a las oportunidades del cliente que aún no lo tienen, sin releer las fuentes. Corre en segundo plano.',
        inputSchema: { cliente_id: z.number().int() },
    }, envolver(({ cliente_id: id }) => llamar(`/api/clientes/${id}/evaluar`, { metodo: 'POST' })));

    servidor.registerTool('consultar_ayudas_cliente', {
        title: 'Consultar ayudas recibidas (BDNS)',
        description: 'Consulta en la BDNS las concesiones y el minimis del NIF del cliente y lo guarda en su ficha.',
        inputSchema: { cliente_id: z.number().int() },
    }, envolver(async ({ cliente_id: id }) => {
        const k = await llamar(`/api/clientes/${id}/ayudas`, { metodo: 'POST' });
        return { minimis_3_anios: k.minimis_3_anios, ayudas_recibidas: k.ayudas_recibidas };
    }));

    servidor.registerTool('paquete_islaris', {
        title: 'Paquete para el informe de ayudas',
        description: 'Texto con la ficha del cliente y las convocatorias abiertas verdes, amarillas y sin evaluar, más lo que '
            + 'el Radar no cubre. Es el punto de partida del paso 2 (informe exhaustivo de ayudas).',
        inputSchema: { cliente_id: z.number().int(), incluir_rojas: z.boolean().optional() },
    }, envolver(async ({ cliente_id: id, incluir_rojas: rojas }) => (await llamar(`/api/clientes/${id}/islaris${rojas ? '?rojas=1' : ''}`)).markdown));

    servidor.registerTool('ver_convocatoria', {
        title: 'Ver una convocatoria',
        description: 'Ficha completa de una convocatoria del Radar: importes, plazo, enlaces a anuncio, bases y pliegos, lotes.',
        inputSchema: { convocatoria_id: z.number().int() },
    }, envolver(async ({ convocatoria_id: id }) => {
        const c = await llamar(`/api/convocatorias/${id}`);
        const { analisis: _a, cambios: _c, competencia, ...resto } = c;
        return { ...resto, competencia_en_el_organismo: competencia };
    }));

    servidor.registerTool('marcar_oportunidad', {
        title: 'Cambiar el estado de una oportunidad',
        description: 'Registra la decisión sobre una oportunidad del cliente: en_estudio (se analiza), propuesta (propuesta '
            + 'enviada al cliente), descartada o sugerida.',
        inputSchema: {
            cliente_id: z.number().int(), convocatoria_id: z.number().int(),
            estado: z.enum(['sugerida', 'en_estudio', 'propuesta', 'descartada']),
        },
    }, envolver(({ cliente_id: k, convocatoria_id: c, estado }) => llamar(`/api/clientes/${k}/oportunidades/${c}`, {
        metodo: 'PATCH', cuerpo: { estado },
    })));

    return servidor;
}

if (require.main === module) {
    crearServidorMcp().connect(new StdioServerTransport()).catch((e) => {
        process.stderr.write(`No se pudo arrancar el conector MCP: ${e.message}\n`);
        process.exit(1);
    });
}

module.exports = { crearServidorMcp, resumirOportunidades };
