'use strict';

// fetch con tiempo máximo y reintentos para las fuentes públicas.

class ErrorHttp extends Error {
    constructor(status, url, cuerpo) {
        super(`HTTP ${status} en ${url}${cuerpo ? `: ${cuerpo.slice(0, 200)}` : ''}`);
        this.status = status;
    }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, { metodo = 'GET', cabeceras = {}, cuerpo, tiempo = 30000, reintentos = 2,
    userAgent, como = 'texto', aceptar404 = false } = {}) {
    let ultimoError;
    for (let intento = 0; intento <= reintentos; intento++) {
        try {
            const res = await fetch(url, {
                method: metodo,
                headers: { 'User-Agent': userAgent || 'Vigilante-Convocatorias/0.1', ...cabeceras },
                body: cuerpo,
                signal: AbortSignal.timeout(tiempo),
            });
            if (res.status === 404 && aceptar404) return null;
            if (!res.ok) {
                const texto = await res.text().catch(() => '');
                const err = new ErrorHttp(res.status, url, texto);
                // 4xx (salvo 429) no se reintenta
                if (res.status < 500 && res.status !== 429) throw err;
                ultimoError = err;
            } else {
                return como === 'json' ? await res.json() : await res.text();
            }
        } catch (e) {
            if (e instanceof ErrorHttp && e.status < 500 && e.status !== 429) throw e;
            ultimoError = e;
        }
        if (intento < reintentos) await espera(1000 * 2 ** intento);
    }
    throw ultimoError;
}

module.exports = { pedir, ErrorHttp, espera };
