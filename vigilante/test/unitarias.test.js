'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const texto = require('../src/texto');
const { compilarPalabras, clasificar, esSigla } = require('../src/palabras');
const { detectarSubtipo } = require('../src/subtipo');
const { compilarCron, coincide } = require('../src/cron');
const boe = require('../src/fuentes/boe');
const bdns = require('../src/fuentes/bdns');
const placsp = require('../src/fuentes/placsp');
const ted = require('../src/fuentes/ted');
const { sanear, estadoInicial } = require('../src/vigilante');
const clientes = require('../src/clientes');

const fixture = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const ZONA = 'Europe/Madrid';

test('importes en formato español, inglés y numérico', () => {
    assert.equal(texto.aImporte('1.234.567,89'), '1234567.89');
    assert.equal(texto.aImporte('1,234,567.89'), '1234567.89');
    assert.equal(texto.aImporte('450000'), '450000.00');
    assert.equal(texto.aImporte(1500000), '1500000.00');
    assert.equal(texto.aImporte('1.500.000'), '1500000.00');
    assert.equal(texto.aImporte(''), null);
    assert.equal(texto.aImporte('n/d'), null);
});

test('fechas con zona horaria de Madrid y explícita', () => {
    assert.equal(texto.fechaIso('05/10/2026'), '2026-10-05');
    assert.equal(texto.fechaHora('2026-11-03', '14:00:00', ZONA), '2026-11-03T14:00:00+01:00');
    assert.equal(texto.fechaHora('2026-07-03', '14:00', ZONA), '2026-07-03T14:00:00+02:00');
    assert.equal(texto.fechaHora('2026-11-20+01:00', null, ZONA), '2026-11-20T23:59:59+01:00');
    assert.equal(texto.fechaHora(null), null);
});

test('limpiarHtml quita etiquetas y entidades', () => {
    assert.equal(texto.limpiarHtml('<p>Hasta el&nbsp;30 &amp; m&aacute;s</p>'), 'Hasta el 30 & m&aacute;s');
    assert.equal(texto.limpiarHtml('A<br>B'), 'A\nB');
});

const PALABRAS = compilarPalabras([
    { id: 1, keyword: 'Neotec', categoria: 'programas-financiacion', es_ancla: true },
    { id: 2, keyword: 'AIS', categoria: 'maritimo-portuario', es_ancla: false },
    { id: 3, keyword: 'puerto', categoria: 'maritimo-portuario', es_ancla: false },
    { id: 4, keyword: 'atraque', categoria: 'maritimo-portuario', es_ancla: false },
    { id: 5, keyword: 'gemelo digital', categoria: 'tecnologia-digital', es_ancla: false },
    { id: 6, keyword: 'innovación portuaria', categoria: 'subvenciones', es_ancla: false },
    { id: 7, keyword: 'I+D marino', categoria: 'subvenciones', es_ancla: false },
]);

test('las siglas respetan mayúsculas y límites de palabra', () => {
    assert.ok(esSigla('AIS'));
    assert.ok(esSigla('CEF-T'));
    assert.ok(!esSigla('Neotec'));
    assert.equal(clasificar({ titulo: 'Ayudas al país y su economía' }, PALABRAS), null);
    assert.equal(clasificar({ titulo: 'Sistema ais de prueba' }, PALABRAS), null);
    assert.deepEqual(clasificar({ titulo: 'Receptores AIS' }, PALABRAS).coincidencias, ['AIS']);
});

test('relevancia: ancla alta, específico media, genérico solo baja', () => {
    assert.equal(clasificar({ titulo: 'Programa NEOTEC 2026' }, PALABRAS).relevancia, 'alta');
    assert.equal(clasificar({ titulo: 'Gemelo digital de una fábrica' }, PALABRAS).relevancia, 'media');
    assert.equal(clasificar({ titulo: 'Fiestas de Puerto de la Cruz' }, PALABRAS).relevancia, 'baja');
    assert.equal(clasificar({ titulo: 'Ampliación del puerto', resumen: 'nuevo atraque' }, PALABRAS).relevancia, 'media');
    assert.equal(clasificar({ titulo: 'Gemelo digital del puerto' }, PALABRAS).relevancia, 'alta');
    assert.equal(clasificar({ titulo: 'Ayudas de innovacion portuaria e I+D marino' }, PALABRAS).relevancia, 'alta');
});

test('subtipos', () => {
    assert.equal(detectarSubtipo('Consulta preliminar al mercado para un gemelo digital'), 'consulta_preliminar');
    assert.equal(detectarSubtipo('Request for Information (RFI) port systems'), 'rfi');
    assert.equal(detectarSubtipo('Resolución por la que se conceden las ayudas'), 'resolucion');
    assert.equal(detectarSubtipo('Servicio de mantenimiento', 'anuncio_previo'), 'anuncio_previo');
    assert.equal(detectarSubtipo('Servicio de mantenimiento'), 'convocatoria');
});

test('cron: rangos, listas, pasos y día de la semana', () => {
    // 2026-10-05 es lunes; 08:30 en Madrid = 06:30 UTC (horario de verano)
    const lunes0830 = new Date('2026-10-05T06:30:00Z');
    assert.ok(coincide('30 8 * * *', lunes0830, ZONA));
    assert.ok(coincide('30 8 * * 1-5', lunes0830, ZONA));
    assert.ok(!coincide('30 8 * * 0,6', lunes0830, ZONA));
    assert.ok(coincide('*/15 * * * 1,3,5', lunes0830, ZONA));
    assert.ok(!coincide('31 8 * * *', lunes0830, ZONA));
    assert.throws(() => compilarCron('61 * * * *'));
    assert.throws(() => compilarCron('* * *'));
});

test('BOE: secciones vigiladas, objeto, expediente y código BDNS', () => {
    const items = [...boe.itemsDeSumario(JSON.parse(fixture('boe-sumario.json')))];
    assert.equal(items.length, 4); // la sección 1 no se vigila
    const convs = items.map((i) => boe.aConvocatoria(i, '2026-10-05', ZONA)).filter(Boolean);
    const lic = convs.find((c) => c.tipo === 'licitacion');
    assert.equal(lic.titulo, 'Servicio de mantenimiento evolutivo del sistema de gestión portuaria y del sistema VTS');
    assert.equal(lic.numero_expediente_organo, 'SCT-2026/045');
    const extracto = convs.find((c) => c.external_id === 'BOE-B-2026-30002');
    assert.equal(extracto.numero_expediente_organo, '812345');
    assert.equal(extracto.tipo, 'subvencion');
});

test('BDNS: listado + detalle', () => {
    const item = JSON.parse(fixture('bdns-listado.json')).content[0];
    const c = bdns.aConvocatoria(item, JSON.parse(fixture('bdns-detalle-812345.json')), ZONA);
    assert.equal(c.external_id, '812345');
    assert.equal(c.organismo_texto, 'PROEXCA');
    assert.equal(c.importe_max_ayuda, '1500000.00');
    assert.equal(c.fecha_limite, '2026-11-06T23:59:59+01:00');
    assert.equal(c.url_bases, 'https://www.gobiernodecanarias.org/boc/2026/100/001.html');
    assert.match(bdns.urlListado('2026-10-01', '2026-10-05', 0), /fechaDesde=01%2F10%2F2026/);
});

test('PLACSP: licitación abierta con lotes y pliegos, adjudicación y siguiente página', () => {
    const r = placsp.parsearPagina(fixture('placsp.atom'), ZONA);
    assert.match(r.siguiente, /_20261005_120000\.atom$/);
    const lic = r.elementos.find((e) => e.external_id === '15550001');
    assert.equal(lic.organismo_dir3, 'EA0004530');
    assert.equal(lic.presupuesto_sin_impuestos, '450000.00');
    assert.equal(lic.valor_estimado, '900000.00');
    assert.deepEqual(lic.cpv, ['72267000', '09310000']); // conserva el cero inicial
    assert.equal(lic.fecha_limite, '2026-11-03T14:00:00+01:00');
    assert.equal(lic.lotes.length, 2);
    assert.match(lic.url_pliego_tecnico, /ppt-sct/);
    const adj = r.elementos.find((e) => e.clase === 'adjudicacion');
    assert.equal(adj.adjudicatario_nombre, 'COMPETIDOR MARITIMO SL');
    assert.equal(adj.numero_licitadores, 4);
    assert.equal(r.elementos.find((e) => e.external_id === '15550004').subtipo_pista, 'anuncio_previo');
});

test('TED: título en español sin prefijos, país ISO-2 y consultas por lotes', () => {
    const [nl, es] = JSON.parse(fixture('ted.json')).notices.map((n) => ted.aConvocatoria(n, ZONA));
    assert.equal(nl.titulo, 'Vessel traffic service upgrade');
    assert.equal(nl.idioma_original, 'en');
    assert.equal(nl.pais, 'NL');
    assert.equal(es.titulo, 'Mantenimiento evolutivo del sistema de gestión portuaria y del sistema VTS');
    assert.equal(es.titulo_original, null);
    const consultas = ted.construirConsultas(compilarPalabras(
        Array.from({ length: 20 }, (_, i) => ({ id: i, keyword: `port ${i}`, categoria: 'licitaciones' }))), '2026-10-01', '2026-10-05');
    assert.equal(consultas.length, 2);
    assert.match(consultas[0], /PD >= 20261001 AND PD <= 20261005$/);
});

test('sanear deja vacíos los importes incoherentes y deduce el ámbito', () => {
    const c = sanear({ external_id: 'x', titulo: ' T ', presupuesto_sin_impuestos: '100', presupuesto_con_impuestos: '90',
        valor_estimado: '50', pais: 'FR', cpv: [] });
    assert.equal(c.presupuesto_con_impuestos, null);
    assert.equal(c.valor_estimado, null);
    assert.equal(c.ambito, 'extranjero');
    assert.equal(c.cpv, null);
    assert.equal(c.titulo, 'T');
    assert.equal(estadoInicial({ subtipo: 'resolucion' }), 'ignorada');
    assert.equal(estadoInicial({ subtipo: 'convocatoria', fecha_limite: '2000-01-01T00:00:00Z' }), 'vencida');
    assert.equal(estadoInicial({ subtipo: 'convocatoria', fecha_limite: null }), 'nueva');
});

test('clientes: territorio por defecto y coincidencia por palabra clave o territorio', () => {
    assert.deepEqual(clientes.territoriosDe({ isla: 'Tenerife', municipio: 'La Laguna', territorios: [] }), ['Canarias', 'Tenerife', 'La Laguna']);
    assert.deepEqual(clientes.territoriosDe({ territorios: ['Lanzarote'] }), ['Lanzarote']);
    const k = clientes.compilarClienteBusqueda({ id: 1, intereses: ['subvencion'], palabras_clave: ['eficiencia energética'],
        isla: 'Tenerife', incluir_territorio: true, territorios: [] });
    assert.deepEqual(clientes.coincideCliente(k, { tipo: 'subvencion', titulo: 'Ayudas a la EFICIENCIA ENERGETICA en hoteles' }),
        { origen: 'palabra_clave', coincidencias: ['eficiencia energética'] });
    assert.equal(clientes.coincideCliente(k, { tipo: 'subvencion', titulo: 'Becas', organismo_texto: 'CABILDO INSULAR DE TENERIFE' }).origen, 'territorio');
    assert.equal(clientes.coincideCliente(k, { tipo: 'subvencion', titulo: 'Becas', organismo_texto: 'Ayuntamiento de Madrid' }), null);
    assert.equal(clientes.coincideCliente(k, { tipo: 'licitacion', titulo: 'Eficiencia energética' }), null);
});

test('paquete para Islaris: ficha, convocatorias y lo que no cubre', () => {
    const md = clientes.componerPaqueteIslaris(
        { razon_social: 'ACME SL', isla: 'Tenerife', proyecto: 'Placas solares', intereses: ['subvencion'] },
        [{ titulo: 'Autoconsumo', organismo_texto: 'IDAE', tipo: 'subvencion', fuente: 'BDNS', external_id: '1',
            fecha_limite: null, ventanilla_permanente: true, semaforo: 'amarillo', encaje: 60, motivo: 'Encaja', estado: 'sugerida',
            url_original: 'https://x', origen: 'palabra_clave', coincidencias: ['autoconsumo'] }],
        { fecha: new Date('2026-10-07T10:00:00Z') });
    assert.match(md, /Proyecto a financiar: Placas solares/);
    assert.match(md, /Plazo: ventanilla permanente/);
    assert.match(md, /🟡 Amarillo \(60\/100\)/);
    assert.match(md, /REF/);
});
