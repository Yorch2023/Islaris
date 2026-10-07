'use strict';

// El conector MCP contra el vigilante real (API en memoria + PostgreSQL de pruebas).
// Necesita VIGILANTE_TEST_DATABASE_URL y que integracion.test.js haya creado el esquema.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const URL_BD = process.env.VIGILANTE_TEST_DATABASE_URL;
const opciones = { skip: URL_BD ? false : 'define VIGILANTE_TEST_DATABASE_URL para la prueba con PostgreSQL' };

let servidorWeb;
let cliente;
let db;

before(async () => {
    if (!URL_BD) return;
    const { obtenerPool } = require('../src/db');
    const { migrar } = require('../src/migrar');
    const { crearServidor } = require('../src/servidor');
    db = obtenerPool(URL_BD);
    await migrar(db, { log: () => {} });
    servidorWeb = crearServidor(db, {
        zonaHoraria: 'Europe/Madrid', diasRastreo: 90, perfilEmpresa: path.join(__dirname, '..', 'config', 'perfil-empresa.md'),
        fuentes: [], userAgent: 'prueba', smtp: {},
    }, { log: () => {} });
    await new Promise((ok) => servidorWeb.listen(0, '127.0.0.1', ok));
    process.env.VIGILANTE_URL = `http://127.0.0.1:${servidorWeb.address().port}`;
    const { crearServidorMcp } = require('../mcp/servidor-mcp');
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
    const [a, b] = InMemoryTransport.createLinkedPair();
    await crearServidorMcp().connect(a);
    cliente = new Client({ name: 'prueba', version: '1' });
    await cliente.connect(b);
});

after(async () => {
    if (cliente) await cliente.close();
    if (servidorWeb) servidorWeb.close();
    if (db) await require('../src/db').cerrarPool();
});

const llamar = async (name, args = {}) => {
    const r = await cliente.callTool({ name, arguments: args });
    const texto = r.content[0].text;
    return { error: r.isError, datos: (() => { try { return JSON.parse(texto); } catch { return texto; } })() };
};

test('MCP: herramientas disponibles', opciones, async () => {
    const { tools } = await cliente.listTools();
    const nombres = tools.map((t) => t.name);
    for (const n of ['estado_vigilante', 'buscar_empresa', 'guardar_cliente', 'buscar_convocatorias_cliente', 'ver_cliente',
        'paquete_islaris', 'marcar_oportunidad', 'consultar_ayudas_cliente', 'sugerir_palabras_clave']) {
        assert.ok(nombres.includes(n), n);
    }
});

test('MCP: flujo de la skill (estado, alta, ficha, paquete)', opciones, async () => {
    await db.query("DELETE FROM cliente WHERE cif = 'B76531938'");
    const estado = await llamar('estado_vigilante');
    assert.equal(estado.error, undefined);
    assert.equal(estado.datos.en_marcha, false);

    // Sin IA, buscar_empresa valida el NIF y deduce la forma jurídica
    const emp = await llamar('buscar_empresa', { nif: 'B38517827' });
    assert.equal(emp.datos.forma_juridica, 'Sociedad limitada');
    assert.equal(emp.datos.nif_valido, true);

    const alta = await llamar('guardar_cliente', {
        razon_social: 'Prueba MCP SL', cif: 'B76531938', isla: 'Tenerife', municipio: 'La Laguna',
        empleados: 70, facturacion: 33000000, palabras_clave: ['frío industrial'], intereses: ['subvencion'],
        ayudas_recibidas: { resumen_minimis: { consumido_3_anios: 0, margen: 300000 }, concesiones: [], minimis: [] },
    });
    assert.equal(alta.error, undefined, JSON.stringify(alta.datos));
    const id = alta.datos.cliente_id;
    assert.match(alta.datos.web, /#cliente=/);

    const ficha = await llamar('ver_cliente', { cliente_id: id });
    assert.equal(ficha.datos.ficha.tamano, 'mediana empresa');
    assert.ok(Array.isArray(ficha.datos.oportunidades));

    const paquete = await llamar('paquete_islaris', { cliente_id: id });
    assert.match(paquete.datos, /Prueba MCP SL/);
    assert.match(paquete.datos, /Tamaño orientativo: mediana empresa/);
    assert.match(paquete.datos, /margen hasta el tope general/);

    const repetido = await llamar('guardar_cliente', { razon_social: 'Otra', cif: 'B76531938' });
    assert.equal(repetido.error, true);
    assert.match(repetido.datos, /Ya existe un cliente con ese NIF/);

    const act = await llamar('guardar_cliente', { cliente_id: id, notas: 'actualizado' });
    assert.equal(act.datos.cliente_id, id);

    // Errores legibles
    const mal = await llamar('ver_cliente', { cliente_id: 999999 });
    assert.equal(mal.error, true);
    assert.match(mal.datos, /No existe ese cliente/);

    await db.query('DELETE FROM cliente WHERE id = $1', [id]);
});
