'use strict';

// Interpreta expresiones cron de 5 campos (minuto hora día mes día_semana), las de la
// columna fuente.cron: "*", listas "1,3,5", rangos "1-5" y pasos "*/15".

const LIMITES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function expandir(campo, [min, max]) {
    const valores = new Set();
    for (const parte of campo.split(',')) {
        const [rango, pasoTxt] = parte.split('/');
        const paso = pasoTxt ? parseInt(pasoTxt, 10) : 1;
        let desde;
        let hasta;
        if (rango === '*') {
            [desde, hasta] = [min, max];
        } else if (rango.includes('-')) {
            [desde, hasta] = rango.split('-').map((n) => parseInt(n, 10));
        } else {
            desde = parseInt(rango, 10);
            hasta = pasoTxt ? max : desde;
        }
        if (![desde, hasta, paso].every(Number.isFinite) || paso < 1 || desde < min || hasta > max || desde > hasta) {
            throw new Error(`Campo cron no válido: "${campo}"`);
        }
        for (let v = desde; v <= hasta; v += paso) valores.add(v);
    }
    return valores;
}

function compilarCron(expr) {
    const campos = String(expr).trim().split(/\s+/);
    if (campos.length !== 5) throw new Error(`Expresión cron no válida: "${expr}"`);
    const [min, hora, dia, mes, dsem] = campos.map((c, i) => expandir(c, LIMITES[i]));
    if (dsem.has(7)) dsem.add(0);
    return {
        min, hora, dia, mes, dsem,
        diaLibre: campos[2] === '*',
        dsemLibre: campos[4] === '*',
    };
}

/** Partes de la fecha en la zona horaria indicada. */
function partesEnZona(fecha, zona) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: zona, hour12: false, minute: 'numeric', hour: 'numeric', day: 'numeric', month: 'numeric',
        weekday: 'short',
    }).formatToParts(fecha).map((x) => [x.type, x.value]));
    const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
        min: parseInt(p.minute, 10), hora: parseInt(p.hour, 10) % 24, dia: parseInt(p.day, 10),
        mes: parseInt(p.month, 10), dsem: dias[p.weekday],
    };
}

/** ¿Toca ejecutar en este minuto? (semántica estándar: día del mes O día de la semana) */
function coincide(cron, fecha, zona = 'Europe/Madrid') {
    const c = typeof cron === 'string' ? compilarCron(cron) : cron;
    const p = partesEnZona(fecha, zona);
    if (!c.min.has(p.min) || !c.hora.has(p.hora) || !c.mes.has(p.mes)) return false;
    if (c.diaLibre && c.dsemLibre) return true;
    if (c.diaLibre) return c.dsem.has(p.dsem);
    if (c.dsemLibre) return c.dia.has(p.dia);
    return c.dia.has(p.dia) || c.dsem.has(p.dsem);
}

module.exports = { compilarCron, coincide };
