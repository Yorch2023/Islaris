'use strict';

// Ayudas que ha recibido una empresa según la BDNS: concesiones y ayudas de minimis
// publicadas con su NIF. Sirve para el límite de minimis (Rgto. UE 2023/2831: 300.000 €
// en 3 años) y para ver en qué programas ha entrado antes.

const { aImporte, fechaIso, arr } = require('../texto');

const BASE = 'https://www.infosubvenciones.es/bdnstrans/api';
const TAM_PAGINA = 100;
const MAX_PAGINAS = 10;
const TOPE_MINIMIS_GENERAL = 300000;

function urlBusqueda(tipo, nif, pagina) {
    const q = new URLSearchParams({ vpd: 'GE', page: String(pagina), pageSize: String(TAM_PAGINA), nifCif: nif });
    return `${BASE}/${tipo}/busqueda?${q}`;
}

function textoDe(v) {
    if (!v) return null;
    if (typeof v === 'object') return v.descripcion || v.nombre || null;
    return String(v);
}

/** Convierte un registro de concesión o de minimis a un formato común. */
function normalizar(r, tipo) {
    const organo = textoDe(r.convocante)
        || [r.nivel1, r.nivel2, r.nivel3].filter(Boolean).join(' > ') || null;
    return {
        tipo,
        codigo: String(r.codConcesion ?? r.codigoConcesion ?? r.idConcesion ?? r.id ?? ''),
        fecha: fechaIso(r.fechaConcesion ?? r.fecha ?? r.fechaRegistro),
        importe: aImporte(r.importe ?? r.ayudaEquivalente),
        ayuda_equivalente: aImporte(r.ayudaEquivalente ?? r.importe),
        convocatoria: textoDe(r.convocatoria) || textoDe(r.descripcionConvocatoria) || r.descripcion || null,
        numero_convocatoria: r.numeroConvocatoria ? String(r.numeroConvocatoria) : null,
        organo,
        instrumento: textoDe(r.instrumento),
        reglamento: textoDe(r.reglamento),
        beneficiario: textoDe(r.beneficiario),
    };
}

async function buscarTodo(tipo, nif, pedir) {
    const salida = [];
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const datos = await pedir(urlBusqueda(tipo, nif, pagina), {
            como: 'json', cabeceras: { Accept: 'application/json' }, aceptar404: true,
        });
        const filas = arr(datos?.content);
        salida.push(...filas.map((r) => normalizar(r, tipo)));
        const total = Number(datos?.totalPages ?? 0);
        if (filas.length < TAM_PAGINA || (total && pagina + 1 >= total)) break;
    }
    // Si la API no aplicara el filtro, nos quedamos solo con lo que lleva este NIF
    return salida.filter((a) => !a.beneficiario || a.beneficiario.toUpperCase().replace(/[^0-9A-Z]/g, '').includes(nif));
}

/** Suma del minimis de los últimos 3 años (ventana móvil desde la fecha de referencia). */
function resumirMinimis(minimis, hoy = new Date()) {
    const corte = new Date(hoy);
    corte.setFullYear(corte.getFullYear() - 3);
    const corteIso = corte.toISOString().slice(0, 10);
    const vigentes = minimis.filter((m) => m.fecha && m.fecha >= corteIso);
    const consumido = vigentes.reduce((s, m) => s + Number(m.ayuda_equivalente || m.importe || 0), 0);
    return {
        consumido_3_anios: Number(consumido.toFixed(2)),
        tope_general: TOPE_MINIMIS_GENERAL,
        margen: Number((TOPE_MINIMIS_GENERAL - consumido).toFixed(2)),
        desde: corteIso,
        n_ayudas: vigentes.length,
    };
}

/**
 * Consulta las concesiones y el minimis de un NIF. Devuelve
 * { nif, concesiones, minimis, resumen_minimis, consultado_at }.
 */
async function ayudasRecibidas(nif, { pedir, hoy = new Date() }) {
    const limpio = String(nif || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!limpio) throw new Error('Falta el NIF');
    const [concesiones, minimis] = await Promise.all([
        buscarTodo('concesiones', limpio, pedir),
        buscarTodo('minimis', limpio, pedir),
    ]);
    const ordenar = (l) => l.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    return {
        nif: limpio,
        concesiones: ordenar(concesiones),
        minimis: ordenar(minimis),
        resumen_minimis: resumirMinimis(minimis, hoy),
        consultado_at: hoy.toISOString(),
    };
}

module.exports = { ayudasRecibidas, resumirMinimis, normalizar, urlBusqueda, TOPE_MINIMIS_GENERAL };
