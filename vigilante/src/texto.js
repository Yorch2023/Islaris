'use strict';

// Utilidades de texto, importes y fechas compartidas por todas las fuentes.

/** Quita tildes y diacríticos ("homogeneización" → "homogeneizacion"). */
function sinTildes(s) {
    return String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '');
}

/** Forma canónica para comparar: sin tildes, minúsculas y espacios simples. */
function normalizar(s) {
    return sinTildes(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Convierte un fragmento HTML en texto plano legible. */
function limpiarHtml(s) {
    if (s === null || s === undefined) return null;
    return String(s)
        .replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
            if (e[0] === '#') {
                const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
                return Number.isFinite(code) ? String.fromCodePoint(code) : m;
            }
            return ENTIDADES[e.toLowerCase()] ?? m;
        })
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
}

/**
 * Interpreta un importe que puede venir como número, "1234.56", "1.234,56" o
 * "1,234.56". Devuelve string con 2 decimales (para NUMERIC) o null.
 */
function aImporte(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(2) : null;
    let s = String(v).replace(/[^\d.,-]/g, '');
    if (!s || !/\d/.test(s)) return null;
    const ultimaComa = s.lastIndexOf(',');
    const ultimoPunto = s.lastIndexOf('.');
    if (ultimaComa > ultimoPunto) {
        // Formato español: el punto es separador de miles
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (ultimoPunto > ultimaComa && ultimaComa !== -1) {
        s = s.replace(/,/g, '');
    } else if (ultimaComa === -1 && (s.match(/\./g) || []).length > 1) {
        s = s.replace(/\./g, '');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n.toFixed(2) : null;
}

/** "05/10/2026" → "2026-10-05". Acepta también ISO. */
function fechaIso(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
}

/** Une fecha (YYYY-MM-DD, con o sin zona "+01:00") y hora opcional en un timestamptz ISO. */
function fechaHora(fecha, hora, zonaPorDefecto = 'Europe/Madrid') {
    if (!fecha) return null;
    const s = String(fecha).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?(Z|[+-]\d{2}:?\d{2})?/);
    if (!m) return null;
    const h = (hora && String(hora).match(/^\d{2}:\d{2}(:\d{2})?/)?.[0]) || m[2] || '23:59:59';
    const hh = h.length === 5 ? `${h}:00` : h;
    const zona = m[3] || (hora && String(hora).match(/(Z|[+-]\d{2}:?\d{2})$/)?.[1]);
    if (zona) return `${m[1]}T${hh}${zona === 'Z' ? 'Z' : zona.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')}`;
    return `${m[1]}T${hh}${desfaseZona(m[1], zonaPorDefecto)}`;
}

/** Desfase horario (p. ej. "+02:00") de una zona IANA en una fecha dada. */
function desfaseZona(fechaYmd, zona) {
    const d = new Date(`${fechaYmd}T12:00:00Z`);
    const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' })
        .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
    const m = partes.match(/GMT([+-]\d{2}):?(\d{2})?/);
    return m ? `${m[1]}:${m[2] || '00'}` : 'Z';
}

/** YYYY-MM-DD de hoy en la zona indicada. */
function hoyYmd(zona = 'Europe/Madrid', base = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(base);
}

function sumarDias(ymd, dias) {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

/** Devuelve siempre un array (los parsers XML devuelven objeto si hay un solo hijo). */
function arr(v) {
    if (v === null || v === undefined) return [];
    return Array.isArray(v) ? v : [v];
}

/** Texto de un nodo XML parseado ({"#text": ...} o valor simple). */
function txt(v) {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return txt(v[0]);
    if (typeof v === 'object') return v['#text'] !== undefined ? String(v['#text']).trim() : null;
    const s = String(v).trim();
    return s === '' ? null : s;
}

function recortar(s, max) {
    if (!s) return s ?? null;
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

module.exports = {
    sinTildes, normalizar, limpiarHtml, aImporte, fechaIso, fechaHora, desfaseZona,
    hoyYmd, sumarDias, arr, txt, recortar,
};
