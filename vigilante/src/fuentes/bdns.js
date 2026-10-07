'use strict';

// BDNS / Sistema Nacional de Publicidad de Subvenciones (infosubvenciones.es).
// 1) Listado de convocatorias registradas en el periodo.
// 2) Para las que encajan por palabras clave, ficha de detalle (plazos, presupuesto, bases).

const { fechaIso, fechaHora, aImporte, limpiarHtml, recortar, arr } = require('../texto');

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
    for (let pagina = 0; pagina < config.bdnsMaxPaginas; pagina++) {
        const datos = await pedir(urlListado(desde, hasta, pagina), {
            como: 'json', cabeceras: { Accept: 'application/json' }, userAgent: config.userAgent,
        });
        const items = arr(datos?.content);
        for (const item of items) {
            const previa = aConvocatoria(item, null, config.zonaHoraria);
            if (!interesa(previa)) continue;
            let detalle = null;
            try {
                detalle = await pedir(urlDetalle(previa.external_id), {
                    como: 'json', cabeceras: { Accept: 'application/json' }, userAgent: config.userAgent,
                });
            } catch (e) {
                log(`BDNS: sin detalle de ${previa.external_id}: ${e.message}`);
            }
            yield aConvocatoria(item, detalle, config.zonaHoraria);
        }
        const total = Number(datos?.totalPages ?? 0);
        const tope = Math.min(total || config.bdnsMaxPaginas, config.bdnsMaxPaginas);
        progreso((pagina + 1) / tope, `página ${pagina + 1} de ${tope}`);
        if (items.length < TAM_PAGINA || (total && pagina + 1 >= total)) break;
    }
}

module.exports = { codigo: 'BDNS', leer, aConvocatoria, urlListado, urlDetalle };
