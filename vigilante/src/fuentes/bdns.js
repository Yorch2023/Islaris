'use strict';

// BDNS / Sistema Nacional de Publicidad de Subvenciones (infosubvenciones.es).
// 1) Listado de convocatorias registradas en el periodo.
// 2) Para las que encajan por palabras clave, ficha de detalle (plazos, presupuesto, bases).

const { fechaIso, fechaHora, aImporte, limpiarHtml, recortar, arr } = require('../texto');
const { enParalelo } = require('../concurrencia');

const BASE = 'https://www.infosubvenciones.es/bdnstrans/api';
const TAM_PAGINA = 50;

function ddmmyyyy(ymd) {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
}

function urlListado(desde, hasta, pagina) {
    const q = new URLSearchParams({
        vpd: 'GE', page: String(pagina), pageSize: String(TAM_PAGINA),
        order: 'numeroConvocatoria', direccion: 'desc',
        fechaDesde: ddmmyyyy(desde), fechaHasta: ddmmyyyy(hasta),
    });
    return `${BASE}/convocatorias/busqueda?${q}`;
}

function urlDetalle(numConv) {
    return `${BASE}/convocatorias?${new URLSearchParams({ numConv, vpd: 'GE' })}`;
}

function urlPublica(numConv) {
    return `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/${encodeURIComponent(numConv)}`;
}

function organoTexto(o) {
    return [o?.nivel3, o?.nivel2, o?.nivel1].find((x) => x && String(x).trim()) || null;
}

/** Convierte un elemento del listado (y, si existe, su detalle) a convocatoria normalizada. */
function aConvocatoria(item, detalle, zona) {
    const num = String(item.numeroConvocatoria ?? detalle?.codigoBDNS ?? item.id);
    const d = detalle || {};
    const finalidad = d.descripcionFinalidad ? `Finalidad: ${d.descripcionFinalidad}` : null;
    const plazo = [d.textInicio && `Inicio: ${limpiarHtml(d.textInicio)}`, d.textFin && `Fin: ${limpiarHtml(d.textFin)}`]
        .filter(Boolean).join(' · ');
    const beneficiarios = arr(d.tiposBeneficiarios).map((b) => b.descripcion).filter(Boolean).join(', ');
    const o = d.organo || item;
    const organoCompleto = [o?.nivel1, o?.nivel2, o?.nivel3].filter((x) => x && String(x).trim()).join(' > ');
    const resumen = [
        organoCompleto ? `Órgano: ${organoCompleto}` : null,
        d.descripcionLeng && d.descripcionLeng !== item.descripcion ? d.descripcionLeng : null,
        finalidad,
        beneficiarios && `Beneficiarios: ${beneficiarios}`,
        arr(d.instrumentos).map((i) => i.descripcion).filter(Boolean).join(', ') || null,
        plazo || null,
        d.reglamento?.descripcion ? `Reglamento: ${d.reglamento.descripcion}` : null,
        d.sedeElectronica ? `Sede electrónica: ${d.sedeElectronica}` : null,
    ].filter(Boolean).join('\n');

    return {
        clase: 'convocatoria',
        fuente: 'BDNS',
        external_id: num,
        tipo: 'subvencion',
        titulo: recortar(String(item.descripcion || d.descripcion || '').trim(), 2000),
        organismo_texto: organoTexto(d.organo || item),
        numero_expediente_organo: num,
        fecha_publicacion: fechaHora(fechaIso(item.fechaRecepcion || d.fechaRecepcion), '00:00:00', zona),
        fecha_limite: fechaHora(fechaIso(d.fechaFinSolicitud), '23:59:59', zona),
        importe_max_ayuda: aImporte(d.presupuestoTotal),
        url_original: urlPublica(num),
        url_bases: d.urlBasesReguladoras || null,
        pais: 'ES',
        resumen: resumen || null,
    };
}

async function* leer(ctx) {
    const { desde, hasta, pedir, config, interesa, log, progreso = () => {} } = ctx;
    const opciones = { como: 'json', cabeceras: { Accept: 'application/json' }, userAgent: config.userAgent };
    const listado = (pagina) => pedir(urlListado(desde, hasta, pagina), opciones);

    // La primera página dice cuántas hay; el resto se pide de 4 en 4
    const primera = await listado(0);
    const totalPaginas = Number(primera?.totalPages ?? 0);
    const tope = Math.max(1, Math.min(totalPaginas || config.bdnsMaxPaginas, config.bdnsMaxPaginas));
    let hechas = 0;

    async function* procesar(datos) {
        const items = arr(datos?.content);
        const interesantes = items.filter((item) => interesa(aConvocatoria(item, null, config.zonaHoraria)));
        // Las fichas de detalle se descargan 5 a la vez
        const detalles = await enParalelo(interesantes, 5, (item) => pedir(urlDetalle(String(item.numeroConvocatoria ?? item.id)), opciones));
        for (const [i, item] of interesantes.entries()) {
            let detalle = detalles[i];
            if (detalle?.error) {
                log(`BDNS: sin detalle de ${item.numeroConvocatoria}: ${detalle.error.message}`);
                detalle = null;
            }
            yield aConvocatoria(item, detalle, config.zonaHoraria);
        }
        hechas++;
        progreso(hechas / tope, `página ${hechas} de ${tope}`);
    }

    yield* procesar(primera);
    if (arr(primera?.content).length < TAM_PAGINA) return;
    if (!totalPaginas) {
        // Sin total conocido: página a página hasta que se acaben
        for (let pagina = 1; pagina < config.bdnsMaxPaginas; pagina++) {
            const datos = await listado(pagina);
            yield* procesar(datos);
            if (arr(datos?.content).length < TAM_PAGINA) return;
        }
        return;
    }
    for (let desdePag = 1; desdePag < tope; desdePag += 4) {
        const paginas = Array.from({ length: Math.min(4, tope - desdePag) }, (_, i) => desdePag + i);
        const lote = await enParalelo(paginas, 4, (pg) => listado(pg));
        for (const datos of lote) {
            if (datos?.error) throw datos.error;
            yield* procesar(datos);
        }
    }
}

module.exports = { codigo: 'BDNS', leer, aConvocatoria, urlListado, urlDetalle };
