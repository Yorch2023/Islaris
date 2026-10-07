'use strict';

// Prueba de extremo a extremo contra PostgreSQL con las muestras de test/fixtures.
// Necesita una base de datos DESECHABLE: borra el esquema "vigilante" al empezar.
//   VIGILANTE_TEST_DATABASE_URL=postgres://usuario:clave@localhost/vigilante_test npm test

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const URL_BD = process.env.VIGILANTE_TEST_DATABASE_URL;
const opciones = { skip: URL_BD ? false : 'define VIGILANTE_TEST_DATABASE_URL para la prueba con PostgreSQL' };

const { obtenerPool, cerrarPool } = require('../src/db');
const { migrar } = require('../src/migrar');
const { vigilar } = require('../src/vigilante');
const { triarPendientes } = require('../src/triaje');
const { procesarBusquedas } = require('../src/busquedas');
const { crearServidor } = require('../src/servidor');
const clientes = require('../src/clientes');
const { trabajarClientes } = require('../src/tareas');

let db;
const silencio = () => {};

// Las muestras traen plazos de noviembre de 2026: se desplazan para que siempre sean futuros
function enDias(n) {
    return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}
const FECHAS = { '2026-11-03': enDias(28), '2026-11-06': enDias(31), '2026-11-20': enDias(45) };
function fixture(f) {
    let s = fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
    for (const [de, a] of Object.entries(FECHAS)) s = s.split(de).join(a);
    return s;
}

/** Sustituye a fetch: responde con las muestras según la URL. */
async function pedirFalso(url, { como } = {}) {
    let cuerpo;
    if (url.includes('boe.es')) cuerpo = fixture('boe-sumario.json');
    else if (url.includes('convocatorias/busqueda')) cuerpo = fixture('bdns-listado.json');
    else if (url.includes('numConv=812345')) cuerpo = fixture('bdns-detalle-812345.json');
    else if (url.includes('numConv=812347')) cuerpo = fixture('bdns-detalle-812347.json');
    else if (url.includes('ted.europa.eu')) cuerpo = fixture('ted.json');
    else if (url.includes('_20261005_120000')) cuerpo = '<feed xmlns="http://www.w3.org/2005/Atom"></feed>';
    else if (url.includes('contrataciondelestado.es')) cuerpo = fixture('placsp.atom');
    else throw new Error(`URL inesperada: ${url}`);
    return como === 'json' ? JSON.parse(cuerpo) : cuerpo;
}

const CONFIG = {
    zonaHoraria: 'Europe/Madrid',
    relevanciaMinima: 'baja',
    diasAtras: 0,
    fuentes: ['BDNS', 'BOE', 'PLACE', 'TED'],
    placspFeeds: ['https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom'],
    placspMaxPaginas: 3,
    tedMaxPaginas: 1,
    bdnsMaxPaginas: 1,
    modeloTriaje: 'modelo-de-prueba',
    esfuerzoTriaje: 'low',
    triajeLote: 50,
    perfilEmpresa: path.join(__dirname, '..', 'config', 'perfil-empresa.md'),
    smtp: { from: 'vigilante@prueba' },
    token: 'secreto',
};

const conv = async (fuente, externalId) => (await db.query(
    'SELECT * FROM convocatoria WHERE fuente = $1 AND external_id = $2', [fuente, externalId])).rows[0];

before(async () => {
    if (!URL_BD) return;
    db = obtenerPool(URL_BD);
    await db.query('DROP SCHEMA IF EXISTS vigilante CASCADE; DROP TABLE IF EXISTS public.vigilante_migracion');
    await migrar(db, { log: silencio });
});

after(async () => {
    if (db) await cerrarPool();
});

test('vigilancia completa: guarda, clasifica y marca duplicados entre fuentes', opciones, async () => {
    const r = await vigilar(db, CONFIG, { log: silencio, pedirFn: pedirFalso });
    assert.equal(r.BDNS.nuevas, 1);
    assert.equal(r.BOE.nuevas, 4);
    assert.equal(r.PLACE.nuevas, 2);
    assert.equal(r.PLACE.adjudicaciones, 1);
    assert.equal(r.TED.nuevas, 2);

    // BDNS y su extracto en el BOE: el extracto es duplicado
    const bdns = await conv('BDNS', '812345');
    assert.equal(bdns.relevancia, 'alta');
    assert.equal(bdns.duplicado_de_id, null);
    assert.equal((await conv('BOE', 'BOE-B-2026-30002')).duplicado_de_id, bdns.id);

    // PLACSP es más completa que el BOE: pasa a ser la original
    const place = await conv('PLACE', '15550001');
    assert.equal(place.duplicado_de_id, null);
    assert.equal((await conv('BOE', 'BOE-B-2026-30001')).duplicado_de_id, place.id);
    // …y TED (mismo título y plazo) es duplicado de PLACSP
    assert.equal((await conv('TED', '612399-2026')).duplicado_de_id, place.id);

    // Datos de PLACSP: importes, lotes, organismo objetivo y puntuación de la BD
    assert.equal(place.presupuesto_sin_impuestos, '450000.00');
    assert.equal(place.ambito, 'nacional');
    assert.ok(place.score > 600, `score ${place.score}`);
    const lotes = await db.query('SELECT * FROM convocatoria_lote WHERE convocatoria_id = $1', [place.id]);
    assert.equal(lotes.rows.length, 2);
    const org = (await db.query('SELECT * FROM organismo WHERE id = $1', [place.organismo_id])).rows[0];
    assert.equal(org.dir3, 'EA0004530');
    assert.equal(org.es_objetivo, true);
    // TED trae el nombre sin "Presidencia de la": se resuelve al mismo organismo
    assert.equal((await conv('TED', '612399-2026')).organismo_id, place.organismo_id);

    // Resolución de concesión: se guarda pero como ignorada
    const resol = await conv('BOE', 'BOE-A-2026-20002');
    assert.equal(resol.subtipo, 'resolucion');
    assert.equal(resol.estado, 'ignorada');

    // Consulta preliminar: subtipo propio
    assert.equal((await conv('PLACE', '15550004')).subtipo, 'consulta_preliminar');

    // Extranjero
    const nl = await conv('TED', '612345-2026');
    assert.equal(nl.ambito, 'extranjero');
    assert.equal(nl.pais, 'NL');

    // Lo que no coincide con ninguna palabra clave no entra
    assert.equal(await conv('PLACE', '15550003'), undefined);
    assert.equal(await conv('BDNS', '812346'), undefined);

    // Adjudicación del mercado
    const adj = (await db.query('SELECT * FROM adjudicacion_mercado')).rows;
    assert.equal(adj.length, 1);
    assert.equal(adj[0].numero_licitadores, 4);

    // Ejecuciones registradas para la salud de las fuentes
    const salud = (await db.query("SELECT * FROM v_salud_fuentes WHERE codigo IN ('BDNS','BOE','PLACE','TED')")).rows;
    assert.ok(salud.every((f) => f.ultimo_ok && !f.estancada));

    const feed = (await db.query('SELECT fuente, external_id FROM v_feed')).rows;
    assert.equal(feed.length, 5);
});

test('una segunda pasada no duplica ni reescribe nada', opciones, async () => {
    const r = await vigilar(db, CONFIG, { log: silencio, pedirFn: pedirFalso });
    for (const f of CONFIG.fuentes) {
        assert.equal(r[f].nuevas, 0, f);
        assert.equal(r[f].actualizadas, 0, f);
    }
});

test('una corrección manual no la pisa el scraper', opciones, async () => {
    const c = await conv('BDNS', '812345');
    await db.query("UPDATE convocatoria SET titulo = 'Canarias Aporta 2026 (corregido)', corregido_manualmente = true WHERE id = $1", [c.id]);
    await vigilar(db, { ...CONFIG, fuentes: ['BDNS'] }, { log: silencio, pedirFn: pedirFalso });
    assert.equal((await conv('BDNS', '812345')).titulo, 'Canarias Aporta 2026 (corregido)');
});

test('un error de la fuente queda registrado y no para las demás', opciones, async () => {
    const fallo = async (url, op) => {
        if (url.includes('boe.es')) throw new Error('HTTP 503 en BOE');
        return pedirFalso(url, op);
    };
    const r = await vigilar(db, { ...CONFIG, fuentes: ['BOE', 'BDNS'] }, { log: silencio, pedirFn: fallo });
    assert.match(r.BOE.error, /503/);
    assert.ok(!r.BDNS.error);
    const ult = (await db.query("SELECT * FROM fuente_ejecucion WHERE fuente = 'BOE' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(ult.estado, 'error');
});

test('triaje con un cliente simulado: guarda la clasificación y traduce el título', opciones, async () => {
    const peticiones = [];
    const cliente = {
        beta: {
            messages: {
                create: async (p) => {
                    peticiones.push(p);
                    const ficha = p.messages[0].content;
                    const respuesta = ficha.includes('Vessel traffic')
                        ? { clasificacion: 'relevante', motivo: 'VTS portuario', encaje: 85, ambito: 'extranjero',
                            convocante: 'Port of Rotterdam', importe: null, titulo_es: 'Actualización del servicio de tráfico de buques' }
                        : { clasificacion: 'dudosa', motivo: 'Encaje poco claro', encaje: 40, ambito: 'nacional',
                            convocante: null, importe: null, titulo_es: null };
                    return { stop_reason: 'end_turn', model: 'modelo-de-prueba', content: [{ type: 'text', text: JSON.stringify(respuesta) }] };
                },
            },
        },
    };
    const r = await triarPendientes(db, CONFIG, { log: silencio, cliente });
    assert.equal(r.errores, 0);
    assert.ok(r.triadas >= 4);
    assert.equal(peticiones[0].output_config.format.type, 'json_schema');
    const nl = await conv('TED', '612345-2026');
    assert.equal(nl.triage_clasificacion, 'relevante');
    assert.equal(nl.titulo, 'Actualización del servicio de tráfico de buques');
    assert.equal(nl.titulo_original, 'Netherlands – Port management system – Vessel traffic service upgrade');
    // Al volver a leer TED no se pierde la traducción
    await vigilar(db, { ...CONFIG, fuentes: ['TED'] }, { log: silencio, pedirFn: pedirFalso });
    assert.equal((await conv('TED', '612345-2026')).titulo, 'Actualización del servicio de tráfico de buques');
    // Ya no queda nada pendiente
    assert.equal((await db.query('SELECT count(*)::int AS n FROM v_pendientes_triaje')).rows[0].n, 0);
});

test('búsquedas guardadas: avisa una sola vez', opciones, async () => {
    // Solo avisa de lo que entra después de crear la búsqueda: se crea "ayer"
    await db.query(`INSERT INTO busqueda_guardada (usuario_email, nombre, q, tipo, cpv_prefijos, created_at)
                    VALUES ('equipo@prueba', 'Software portuario', 'portuaria', 'licitacion', '{72}', now() - interval '1 day')`);
    await db.query(`INSERT INTO busqueda_guardada (usuario_email, nombre, q, created_at)
                    VALUES ('equipo@prueba', 'Creada hoy', 'portuaria', now() + interval '1 minute')`);
    const enviados = [];
    const transporte = { sendMail: async (m) => { enviados.push(m); } };
    const r1 = await procesarBusquedas(db, CONFIG, { log: silencio, transporte });
    assert.equal(r1.avisadas, 1);
    assert.equal(enviados[0].to, 'equipo@prueba');
    assert.match(enviados[0].text, /gestión portuaria/);
    const r2 = await procesarBusquedas(db, CONFIG, { log: silencio, transporte });
    assert.equal(r2.avisadas, 0);
    assert.equal(enviados.length, 1);
});

test('API web: token, feed, revisión con feedback y alta manual', opciones, async () => {
    const servidor = crearServidor(db, CONFIG, { log: silencio });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const api = (ruta, op = {}) => fetch(base + ruta, {
        ...op,
        headers: { Authorization: 'Bearer secreto', 'Content-Type': 'application/json', 'X-Usuario': 'Ana', ...op.headers },
    });
    try {
        assert.equal((await fetch(`${base}/api/feed`)).status, 401);
        const html = await fetch(`${base}/`);
        assert.equal(html.status, 200);

        const relevantes = await (await api('/api/feed?vista=relevantes')).json();
        assert.ok(relevantes.some((c) => c.fuente === 'TED'));
        const todas = await (await api('/api/feed?vista=todas&q=portuaria')).json();
        assert.ok(todas.length >= 1);

        const place = await conv('PLACE', '15550001');
        const ficha = await (await api(`/api/convocatorias/${place.id}`)).json();
        assert.equal(ficha.lotes.length, 2);
        assert.equal(ficha.duplicados.length, 2);

        // Descartar sin motivo: error; con motivo: feedback para el aprendizaje
        assert.equal((await api(`/api/convocatorias/${place.id}/revision`, { method: 'POST', body: JSON.stringify({ estado: 'descartada' }) })).status, 400);
        const ok = await api(`/api/convocatorias/${place.id}/revision`, {
            method: 'POST', body: JSON.stringify({ estado: 'descartada', motivo_descarte: 'importe_bajo', detalle: 'menos de 500 k' }),
        });
        assert.equal(ok.status, 200);
        const fb = (await db.query('SELECT * FROM feedback_descarte WHERE convocatoria_id = $1', [place.id])).rows[0];
        assert.equal(fb.motivo, 'importe_bajo');
        assert.equal(fb.usuario, 'Ana');
        assert.equal(fb.detalle, 'menos de 500 k');

        // Corregir a mano
        const corr = await (await api(`/api/convocatorias/${place.id}`, { method: 'PATCH', body: JSON.stringify({ presupuesto_sin_impuestos: '460000' }) })).json();
        assert.equal(corr.corregido_manualmente, true);
        assert.ok(corr.cambios.some((c) => c.origen === 'usuario' && c.campo === 'presupuesto_sin_impuestos'));

        // Alta manual: exige plazo o ventanilla permanente
        assert.equal((await api('/api/convocatorias', { method: 'POST', body: JSON.stringify({ titulo: 'X', tipo: 'subvencion' }) })).status, 400);
        const alta = await (await api('/api/convocatorias', {
            method: 'POST', body: JSON.stringify({ titulo: 'Programa abierto de innovación', tipo: 'subvencion', ventanilla_permanente: true }),
        })).json();
        assert.equal(alta.fuente, 'MANUAL');
        assert.equal(alta.ventanilla_permanente, true);

        const salud = await (await api('/api/salud')).json();
        assert.ok(salud.find((f) => f.codigo === 'PLACE').tiene_lector);
        assert.ok(!salud.find((f) => f.codigo === 'SAMGOV').tiene_lector);

        const palabra = await (await api('/api/palabras', { method: 'POST', body: JSON.stringify({ keyword: 'Port Community System', categoria: 'licitaciones' }) })).json();
        assert.equal(palabra.keyword, 'Port Community System');
        assert.equal((await api('/api/palabras', { method: 'POST', body: JSON.stringify({ keyword: 'port community system', categoria: 'licitaciones' }) })).status, 400);

        const contadores = await (await api('/api/contadores')).json();
        assert.equal(typeof contadores.relevantes, 'number');
    } finally {
        servidor.close();
    }
});

test('mantenimiento diario: caduca lo vencido', opciones, async () => {
    const c = await conv('TED', '612345-2026');
    await db.query("UPDATE convocatoria SET fecha_limite = now() - interval '1 day' WHERE id = $1", [c.id]);
    await db.query('CALL vigilante.mantenimiento_diario()');
    const v = await conv('TED', '612345-2026');
    assert.equal(v.estado, 'vencida');
    assert.equal(v.score, 0);
    // Si la fuente amplía el plazo, vuelve al feed
    await vigilar(db, { ...CONFIG, fuentes: ['TED'] }, { log: silencio, pedirFn: pedirFalso });
    assert.equal((await conv('TED', '612345-2026')).estado, 'nueva');
});

test('clientes: captura lo que solo les interesa a ellos, semáforo, paquete para Islaris y aviso', opciones, async () => {
    const k = (await db.query(`
        INSERT INTO cliente (razon_social, isla, municipio, actividad, proyecto, palabras_clave, intereses, umbral_aviso)
        VALUES ('Comercial Teide SL', 'Tenerife', 'La Laguna', 'Tienda de electrodomésticos',
                'Tienda online y TPV nuevo', '{digitalización del pequeño comercio,comercio electrónico}', '{subvencion}', 50)
        RETURNING *`)).rows[0];

    // La ayuda del Cabildo no interesa al grupo: entra marcada solo para clientes
    const r = await vigilar(db, { ...CONFIG, fuentes: ['BDNS'] }, { log: silencio, pedirFn: pedirFalso });
    assert.equal(r.BDNS.nuevas, 1);
    const cabildo = await conv('BDNS', '812347');
    assert.equal(cabildo.solo_clientes, true);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM v_feed WHERE id = $1', [cabildo.id])).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM v_pendientes_triaje WHERE id = $1', [cabildo.id])).rows[0].n, 0);

    // Cruce: por palabra clave (Cabildo) y por territorio (Canarias Aporta, de PROEXCA)
    const cruces = await clientes.cruzarClientes(db, { log: silencio });
    assert.ok(cruces[k.id] >= 2, JSON.stringify(cruces));
    const filas = (await db.query('SELECT * FROM cliente_convocatoria WHERE cliente_id = $1', [k.id])).rows;
    assert.equal(filas.find((f) => f.convocatoria_id === cabildo.id).origen, 'palabra_clave');
    const aporta = await conv('BDNS', '812345');
    assert.equal(filas.find((f) => f.convocatoria_id === aporta.id).origen, 'territorio');
    // Las licitaciones no, porque solo le interesan subvenciones
    const place = await conv('PLACE', '15550004');
    assert.ok(!filas.some((f) => f.convocatoria_id === place.id));

    // Semáforo con un cliente de Claude simulado
    const peticiones = [];
    const ia = { beta: { messages: { create: async (p) => {
        peticiones.push(p);
        const verde = p.messages[0].content.includes('pequeño comercio');
        return { stop_reason: 'end_turn', model: 'modelo-de-prueba', content: [{ type: 'text', text: JSON.stringify(verde
            ? { semaforo: 'verde', encaje: 85, motivo: 'Comercio minorista de Tenerife que se digitaliza', requisito_critico: 'Ser pyme comercial', importe_orientativo: 'hasta el 70 %' }
            : { semaforo: 'rojo', encaje: 10, motivo: 'Es para internacionalización', requisito_critico: null, importe_orientativo: null }) }] };
    } } } };
    const e = await clientes.evaluarEncajes(db, { ...CONFIG, anthropicApiKey: 'x' }, { log: silencio, cliente: ia });
    assert.equal(e.errores, 0);
    assert.ok(e.evaluadas >= 2);
    assert.match(peticiones[0].messages[0].content, /Comercial Teide SL/);
    assert.equal(peticiones[0].output_config.format.schema.properties.semaforo.enum.length, 3);

    // Paquete para la skill: incluye la verde, no la roja
    const md = await clientes.paqueteIslaris(db, k.id);
    assert.match(md, /skill islaris-subvenciones/);
    assert.match(md, /Razón social: Comercial Teide SL/);
    assert.match(md, /modernización y digitalización del pequeño comercio/);
    assert.match(md, /🟢 Verde \(85\/100\)/);
    assert.match(md, /tenerife\.es\/bases-comercio-2026/);
    assert.doesNotMatch(md, /Canarias Aporta 2026/);

    // Aviso por correo: solo la verde (encaje ≥ 50), con el paquete dentro, una sola vez
    const enviados = [];
    const transporte = { sendMail: async (m) => { enviados.push(m); } };
    const cfg = { ...CONFIG, anthropicApiKey: 'x', emailAvisos: 'jorge@prueba', host: '127.0.0.1', puerto: 3080 };
    const a1 = await clientes.avisarClientes(db, cfg, { log: silencio, transporte });
    assert.equal(a1.avisadas, 1);
    assert.equal(enviados[0].to, 'jorge@prueba');
    assert.match(enviados[0].subject, /Comercial Teide SL/);
    assert.match(enviados[0].text, /PARA PEGAR EN CLAUDE/);
    assert.match(enviados[0].text, /#cliente=/);
    const a2 = await clientes.avisarClientes(db, cfg, { log: silencio, transporte });
    assert.equal(a2.avisadas, 0);

    // Sin clave de Claude, trabajarClientes cruza pero no evalúa ni falla
    const t = await trabajarClientes(db, { ...CONFIG, anthropicApiKey: null, emailAvisos: null }, { log: silencio });
    assert.equal(t.encaje.evaluadas, 0);
});

test('API de clientes: alta, cruce inmediato, cambio de estado y paquete', opciones, async () => {
    const servidor = crearServidor(db, CONFIG, { log: silencio });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const api = (ruta, op = {}) => fetch(base + ruta, {
        ...op, headers: { Authorization: 'Bearer secreto', 'Content-Type': 'application/json' },
    });
    try {
        assert.equal((await api('/api/clientes', { method: 'POST', body: JSON.stringify({ isla: 'Tenerife' }) })).status, 400);
        const alta = await (await api('/api/clientes', { method: 'POST', body: JSON.stringify({
            razon_social: 'Naviera Pruebas SL', cif: 'b-12345678', isla: 'Gran Canaria', intereses: ['licitacion'],
            palabras_clave: 'gemelo digital, mantenimiento evolutivo', incluir_territorio: false,
        }) })).json();
        assert.equal(alta.cif, 'B12345678');
        assert.deepEqual(alta.palabras_clave, ['gemelo digital', 'mantenimiento evolutivo']);
        assert.ok(alta.oportunidades.length >= 1, 'el alta cruza en el momento');
        assert.ok(alta.oportunidades.every((o) => o.tipo === 'licitacion'));

        const op = alta.oportunidades[0];
        const est = await api(`/api/clientes/${alta.id}/oportunidades/${op.convocatoria_id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'en_estudio' }) });
        assert.equal((await est.json()).estado, 'en_estudio');

        const lista = await (await api('/api/clientes')).json();
        assert.ok(lista.some((k) => k.razon_social === 'Naviera Pruebas SL'));

        const { markdown } = await (await api(`/api/clientes/${alta.id}/islaris`)).json();
        assert.match(markdown, /Naviera Pruebas SL/);
        assert.match(markdown, /Estado en Islaris: en estudio/);

        // Sin clave no se puede sugerir con IA
        assert.equal((await api(`/api/clientes/${alta.id}/sugerir-palabras`, { method: 'POST' })).status, 400);

        const editado = await (await api(`/api/clientes/${alta.id}`, { method: 'PATCH', body: JSON.stringify({ empleados: 12 }) })).json();
        assert.equal(editado.empleados, 12);
        assert.equal((await api(`/api/clientes/${alta.id}`, { method: 'DELETE' })).status, 200);
    } finally {
        servidor.close();
    }
});
