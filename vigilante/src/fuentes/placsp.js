'use strict';

// Plataforma de Contratación del Sector Público (PLACSP): sindicación Atom (CODICE).
// Las licitaciones abiertas se guardan como convocatoria; las adjudicadas/resueltas
// alimentan adjudicacion_mercado (competencia y nº de licitadores).

const { XMLParser } = require('fast-xml-parser');
const { arr, txt, aImporte, fechaHora, fechaIso, recortar } = require('../texto');

const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,      // conservar ceros a la izquierda en CPV y expedientes
    parseAttributeValue: false,
    trimValues: true,
});

const ABIERTAS = new Set(['PRE', 'PUB', 'EV']);
const CERRADAS = new Set(['ADJ', 'RES']);

// Códigos de procedimiento de CODICE → catálogo del esquema
const PROCEDIMIENTO = {
    1: 'abierto', 2: 'restringido', 3: 'negociado', 4: 'negociado', 5: 'dialogo',
    6: 'otro', 7: 'otro', 8: 'otro', 9: 'abierto_simplificado', 100: 'otro', 999: 'otro',
};

function idsParte(party) {
    const ids = {};
    for (const pi of arr(party?.PartyIdentification)) {
        const id = pi?.ID;
        const esquema = (typeof id === 'object' && id?.['@_schemeName']) || 'ID';
        const valor = txt(id);
        if (valor) ids[String(esquema).toUpperCase()] = valor;
    }
    return ids;
}

function uriDocumento(ref) {
    return txt(arr(ref)[0]?.Attachment?.ExternalReference?.URI);
}

function enlace(entry, rel) {
    for (const l of arr(entry.link)) {
        if (!rel || l?.['@_rel'] === rel || (!l?.['@_rel'] && rel === 'alternate')) return l?.['@_href'] || null;
    }
    return null;
}

function idExterno(entry) {
    const id = txt(entry.id) || '';
    return id.split('/').pop() || id;
}

function aConvocatoria(entry, zona) {
    const cfs = entry.ContractFolderStatus || {};
    const estado = txt(cfs.ContractFolderStatusCode);
    const party = cfs.LocatedContractingParty?.Party;
    const ids = idsParte(party);
    const proyecto = cfs.ProcurementProject || {};
    const presupuesto = proyecto.BudgetAmount || {};
    const lotes = arr(cfs.ProcurementProjectLot);
    const cpv = [...new Set([
        ...arr(proyecto.RequiredCommodityClassification).map((c) => txt(c?.ItemClassificationCode)),
        ...lotes.flatMap((l) => arr(l?.ProcurementProject?.RequiredCommodityClassification)
            .map((c) => txt(c?.ItemClassificationCode))),
    ].filter(Boolean))];
    const plazo = cfs.TenderingProcess?.TenderSubmissionDeadlinePeriod;
    const resumen = txt(entry.summary);
    const lotesNorm = lotes.map((l, i) => ({
        numero: txt(l?.ID) || String(i + 1),
        descripcion: txt(l?.ProcurementProject?.Name),
        presupuesto_sin_impuestos: aImporte(txt(l?.ProcurementProject?.BudgetAmount?.TaxExclusiveAmount)),
        cpv: arr(l?.ProcurementProject?.RequiredCommodityClassification)
            .map((c) => txt(c?.ItemClassificationCode)).filter(Boolean),
    }));

    return {
        clase: 'convocatoria',
        fuente: 'PLACE',
        external_id: idExterno(entry),
        tipo: 'licitacion',
        estado_fuente: estado,
        subtipo_pista: estado === 'PRE' ? 'anuncio_previo' : null,
        pais: 'ES',
        titulo: recortar(txt(proyecto.Name) || txt(entry.title) || '', 2000),
        organismo_texto: txt(party?.PartyName?.Name),
        organismo_dir3: ids.DIR3 || null,
        organismo_nif: ids.NIF || null,
        numero_expediente_organo: txt(cfs.ContractFolderID),
        cpv: cpv.length ? cpv : null,
        fecha_publicacion: txt(entry.updated),
        fecha_limite: plazo ? fechaHora(fechaIso(txt(plazo.EndDate)), txt(plazo.EndTime), zona) : null,
        presupuesto_sin_impuestos: aImporte(txt(presupuesto.TaxExclusiveAmount)),
        presupuesto_con_impuestos: aImporte(txt(presupuesto.TotalAmount)),
        valor_estimado: aImporte(txt(presupuesto.EstimatedOverallContractAmount)),
        procedimiento: PROCEDIMIENTO[txt(cfs.TenderingProcess?.ProcedureCode)] || null,
        url_original: enlace(entry, 'alternate'),
        url_pliego_administrativo: uriDocumento(cfs.LegalDocumentReference),
        url_pliego_tecnico: uriDocumento(cfs.TechnicalDocumentReference),
        resumen: resumen || null,
        lotes: lotesNorm,
    };
}

function aAdjudicaciones(entry, conv) {
    const cfs = entry.ContractFolderStatus || {};
    return arr(cfs.TenderResult).map((r, i) => {
        const ganador = r?.WinningParty;
        const lote = txt(r?.AwardedTenderedProject?.ProcurementProjectLotID);
        return {
            clase: 'adjudicacion',
            fuente: 'PLACE',
            external_id: `${conv.external_id}#${lote || i + 1}`,
            organismo_texto: conv.organismo_texto,
            organismo_dir3: conv.organismo_dir3,
            organismo_nif: conv.organismo_nif,
            titulo: conv.titulo,
            lote,
            presupuesto_sin_impuestos: conv.presupuesto_sin_impuestos,
            importe_adjudicado_sin_impuestos:
                aImporte(txt(r?.AwardedTenderedProject?.LegalMonetaryTotal?.TaxExclusiveAmount)),
            numero_licitadores: parseInt(txt(r?.ReceivedTenderQuantity) ?? '', 10) || null,
            adjudicatario_nombre: txt(ganador?.PartyName?.Name),
            adjudicatario_nif: Object.values(idsParte(ganador))[0] || null,
            fecha_adjudicacion: fechaIso(txt(r?.AwardDate)),
            resumen: conv.resumen,
        };
    }).filter((a) => a.adjudicatario_nombre || a.importe_adjudicado_sin_impuestos);
}

/** Interpreta una página del feed: entradas convertidas y enlace a la siguiente. */
function parsearPagina(xml, zona) {
    const feed = parser.parse(xml)?.feed || {};
    const elementos = [];
    let masAntigua = null;
    for (const entry of arr(feed.entry)) {
        const conv = aConvocatoria(entry, zona);
        if (!masAntigua || (conv.fecha_publicacion && conv.fecha_publicacion < masAntigua)) {
            masAntigua = conv.fecha_publicacion;
        }
        if (ABIERTAS.has(conv.estado_fuente)) elementos.push(conv);
        else if (CERRADAS.has(conv.estado_fuente)) elementos.push(...aAdjudicaciones(entry, conv));
    }
    return { elementos, siguiente: enlace(feed, 'next'), masAntigua };
}

async function* leer(ctx) {
    const { desde, hasta, pedir, config, log, progreso = () => {} } = ctx;
    const feeds = config.placspFeeds;
    const span = Math.max(1, Date.parse(hasta) - Date.parse(desde) + 86400000);
    for (const [f, feedUrl] of feeds.entries()) {
        let url = feedUrl;
        for (let pagina = 0; url && pagina < config.placspMaxPaginas; pagina++) {
            const xml = await pedir(url, { tiempo: 90000, userAgent: config.userAgent });
            const { elementos, siguiente, masAntigua } = parsearPagina(xml, config.zonaHoraria);
            // Avance: cuánto del periodo pedido se ha cubierto ya en este feed
            const cubierto = masAntigua ? (Date.parse(hasta) + 86400000 - Date.parse(masAntigua)) / span : 0;
            const enFeed = Math.max(cubierto, (pagina + 1) / config.placspMaxPaginas);
            progreso((f + Math.min(1, enFeed)) / feeds.length,
                `feed ${f + 1} de ${feeds.length}, página ${pagina + 1}${masAntigua ? `, anuncios del ${masAntigua.slice(0, 10).split('-').reverse().join('/')}` : ''}`);
            yield* elementos;
            // El feed va de más reciente a más antiguo: paramos al pasar de la fecha de corte
            if (masAntigua && masAntigua.slice(0, 10) < desde) break;
            url = siguiente;
            if (pagina + 1 === config.placspMaxPaginas && url) {
                log(`PLACE: alcanzado el máximo de ${config.placspMaxPaginas} páginas en ${feedUrl}`);
            }
        }
    }
}

module.exports = { codigo: 'PLACE', leer, parsearPagina, aConvocatoria, aAdjudicaciones };
