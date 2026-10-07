'use strict';

/**
 * Aplica fn a cada elemento con un máximo de `limite` en paralelo y devuelve los
 * resultados en el mismo orden. Los errores de fn se devuelven como { error }.
 */
async function enParalelo(elementos, limite, fn) {
    const resultados = new Array(elementos.length);
    let siguiente = 0;
    async function trabajador() {
        while (siguiente < elementos.length) {
            const i = siguiente++;
            try {
                resultados[i] = await fn(elementos[i], i);
            } catch (e) {
                resultados[i] = { error: e };
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(limite, elementos.length) }, trabajador));
    return resultados;
}

module.exports = { enParalelo };
