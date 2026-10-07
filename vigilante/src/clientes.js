'use strict';

// Clientes: fichas de empresa, cruce con las convocatorias abiertas, semáforo de encaje
// con Claude, paquete para la skill islaris-subvenciones y avisos por correo.

const { compilarPalabras } = require('./palabras');
const { normalizar } = require('./texto');
const { crearCliente, fichaConvocatoria } = require('./triaje');
const { crearTransporte, escapar, fmtFecha, fmtImporte } = require('./busquedas');
const { tamanoEmpresa, antiguedadAnios } = require('./empresa');
const { enParalelo } = require('./concurrencia');

// ---------------------------------------------------------------------------
// Coincidencia cliente ↔ convocatoria
// ---------------------------------------------------------------------------

/** Territorios del cliente: los indicados o, si no hay, Canarias + isla + municipio. */
function territoriosDe(cliente) {
    const t = (cliente.territorios || []).filter(Boolean);
    if (t.length) return t;
    return [cliente.isla && 'Canarias', cliente.isla, cliente.municipio].filter(Boolean);
}

/** Prepara un cliente para comparar rápido contra muchas convocatorias. */
function compilarClienteBusqueda(cliente) {
    return {
        id: cliente.id,
        intereses: new Set(cliente.intereses?.length ? cliente.intereses : ['subvencion']),
        palabras: compilarPalabras((cliente.palabras_clave || []).filter(Boolean)
            .map((keyword, i) => ({ id: `c${cliente.id}-${i}`, keyword, categoria: 'cliente', es_ancla: false }))),
        territorios: cliente.incluir_territorio
            ? territoriosDe(cliente).map((t) => normalizar(t)).filter((t) => t.length >= 3)
            : [],
    };
}

/**
 * ¿Le interesa esta convocatoria al cliente? Por palabra clave (título o resumen) o,
 * si es una subvención, porque la convoca un organismo de su territorio.
 * Devuelve { origen, coincidencias } o null.
 */
function coincideCliente(k, c) {
    if (!k.intereses.has(c.tipo)) return null;
    const texto = { crudo: `${c.titulo || ''}\n${c.resumen || ''}`, norm: normalizar(`${c.titulo || ''}\n${c.resumen || ''}`) };
    const coincidencias = k.palabras
        .filter((p) => p.regex.test(p.sigla ? texto.crudo : texto.norm))
        .map((p) => p.keyword);
    if (coincidencias.length) return { origen: 'palabra_clave', coincidencias };
    if (c.tipo === 'subvencion' && k.territorios.length) {
        const donde = normalizar(`${c.organismo_texto || ''}\n${c.resumen || ''}`);
        const t = k.territorios.find((x) => new RegExp(`(?<![\\p{L}\\p{N}])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(donde));
        if (t) return { origen: 'territorio', coincidencias: [t] };
    }
    return null;
}

async function clientesActivos(db) {
    return (await db.query('SELECT * FROM cliente WHERE activo ORDER BY id')).rows;
}

/**
 * Cruza cada cliente activo (o uno) con las convocatorias abiertas que aún no tenía
 * vistas. Devuelve { [clienteId]: nuevas }.
 */
async function pendientesDeEvaluar(db, clienteId = null) {
    const { rows } = await db.query(`
        SELECT count(*)::int AS n FROM cliente_convocatoria cc
          JOIN cliente k ON k.id = cc.cliente_id AND k.activo
          JOIN convocatoria c ON c.id = cc.convocatoria_id
         WHERE cc.evaluado_at IS NULL AND cc.estado <> 'descartada'
           AND ($1::bigint IS NULL OR cc.cliente_id = $1)
           AND (c.fecha_limite IS NULL OR c.fecha_limite > now())`, [clienteId]);
    return rows[0].n;
}

async function cruzarClientes(db, { clienteId = null, log = console.log } = {}) {
    const clientes = clienteId
        ? (await db.query('SELECT * FROM cliente WHERE id = $1', [clienteId])).rows
        : await clientesActivos(db);
    const resumen = {};
    for (const cliente of clientes) {
        const k = compilarClienteBusqueda(cliente);
        const { rows } = await db.query(`
            SELECT c.id, c.tipo, c.titulo, c.resumen, c.organismo_texto
              FROM convocatoria c
             WHERE c.duplicado_de_id IS NULL
               AND c.estado NOT IN ('vencida', 'ignorada')
               AND c.subtipo NOT IN ('resolucion', 'informacion_publica')
               AND (c.fecha_limite IS NULL OR c.fecha_limite > now())
               AND NOT EXISTS (SELECT 1 FROM cliente_convocatoria cc
                                WHERE cc.cliente_id = $1 AND cc.convocatoria_id = c.id)`, [cliente.id]);
        let nuevas = 0;
        for (const c of rows) {
            const m = coincideCliente(k, c);
            if (!m) continue;
            await db.query(`
                INSERT INTO cliente_convocatoria (cliente_id, convocatoria_id, origen, coincidencias)
                VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [cliente.id, c.id, m.origen, m.coincidencias]);
            nuevas++;
        }
        resumen[cliente.id] = nuevas;
        if (nuevas) log(`Cliente "${cliente.razon_social}": ${nuevas} convocatorias nuevas por revisar`);
    }
    return resumen;
}

// ---------------------------------------------------------------------------
// Semáforo de encaje con Claude
// ---------------------------------------------------------------------------

const ESQUEMA_ENCAJE = {
    type: 'object',
    additionalProperties: false,
    required: ['semaforo', 'encaje', 'motivo', 'requisito_critico', 'importe_orientativo'],
    properties: {
        semaforo: { type: 'string', enum: ['verde', 'amarillo', 'rojo'] },
        encaje: { type: 'integer', description: 'De 0 a 100.' },
        motivo: { type: 'string', description: 'Por qué encaja o no con ESTE cliente, en una o dos frases concretas.' },
        requisito_critico: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'El principal requisito que hay que verificar antes de comprometerse.',
        },
        importe_orientativo: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Importe o intensidad de ayuda que podría obtener el cliente, solo si la convocatoria lo indica.',
        },
    },
};

const INSTRUCCIONES_ENCAJE = `Eres consultor de subvenciones y licitaciones de Islaris Consulting (Canarias).
Decides si una convocatoria abierta encaja con un cliente concreto, con un semáforo:
- verde: el cliente parece cumplir los requisitos principales (tipo de beneficiario, territorio, sector, tamaño) y su proyecto encaja con la finalidad.
- amarillo: puede encajar, pero hay al menos un requisito que confirmar o faltan datos.
- rojo: no puede pedirla (beneficiario, territorio, sector o tamaño excluidos), el plazo es inviable, o no tiene relación con su actividad o su proyecto.
"encaje" (0-100) mide lo mismo con más detalle. No inventes requisitos ni importes: si la información de la convocatoria no basta, dilo y usa amarillo.
Responde solo con el JSON pedido, en español.`;

function fichaCliente(c) {
    const lineas = [
        `Razón social: ${c.razon_social}`,
        c.cif && `CIF: ${c.cif}`,
        c.forma_juridica && `Forma jurídica: ${c.forma_juridica}`,
        (c.isla || c.municipio) && `Ubicación: ${[c.municipio, c.isla].filter(Boolean).join(', ')} (Canarias)`,
        c.actividad && `Actividad: ${c.actividad}`,
        c.cnae?.length && `CNAE: ${c.cnae.join(', ')}`,
        c.empleados !== null && c.empleados !== undefined && `Empleados: ${c.empleados}`,
        c.facturacion && `Facturación último año: ${fmtImporte(c.facturacion)}`,
        c.fecha_constitucion && `Constituida: ${new Date(c.fecha_constitucion).toISOString().slice(0, 10)}`,
        c.proyecto && `Proyecto a financiar: ${c.proyecto}`,
        c.proyecto_importe && `Importe del proyecto: ${fmtImporte(c.proyecto_importe)}`,
        c.proyecto_plazo && `Plazo del proyecto: ${c.proyecto_plazo}`,
        c.intereses?.length && `Le interesa: ${c.intereses.join(', ')}`,
        tamanoEmpresa(c) && `Tamaño orientativo: ${tamanoEmpresa(c)} (por plantilla y facturación; revisar empresas asociadas o vinculadas)`,
        c.fecha_constitucion && `Antigüedad: ${antiguedadAnios(c.fecha_constitucion)} años`,
        c.minimis_3_anios !== null && c.minimis_3_anios !== undefined && `Ayudas de minimis en los últimos 3 años: ${fmtImporte(c.minimis_3_anios)}`
            + (c.ayudas_recibidas?.resumen_minimis ? ` según la BDNS (margen hasta el tope general de 300.000 €: ${fmtImporte(c.ayudas_recibidas.resumen_minimis.margen)})` : ''),
        c.ayudas_recibidas?.concesiones?.length && `Ayudas concedidas antes según la BDNS: ${c.ayudas_recibidas.concesiones.slice(0, 6)
            .map((a) => `${a.convocatoria || 'convocatoria sin nombre'} (${a.organo || 'organismo n/d'}, ${a.fecha || 's/f'}, ${fmtImporte(a.importe)})`).join('; ')}`
            + (c.ayudas_recibidas.concesiones.length > 6 ? ` y ${c.ayudas_recibidas.concesiones.length - 6} más` : ''),
        c.al_corriente !== null && c.al_corriente !== undefined && `Al corriente con AEAT, Seguridad Social y ATC: ${c.al_corriente ? 'sí' : 'no'}`,
        c.servicios_licitacion && `Servicios que vende a la Administración: ${c.servicios_licitacion}`,
        c.certificaciones && `Certificaciones y solvencia: ${c.certificaciones}`,
        c.notas && `Notas: ${c.notas}`,
    ];
    return lineas.filter(Boolean).join('\n');
}

async function evaluarUna(cli, config, cliente, conv) {
    const r = await cli.beta.messages.create({
        model: config.modeloTriaje,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: config.esfuerzoTriaje, format: { type: 'json_schema', schema: ESQUEMA_ENCAJE } },
        system: [{ type: 'text', text: INSTRUCCIONES_ENCAJE, cache_control: { type: 'ephemeral' } }],
        messages: [{
            role: 'user',
            content: `CLIENTE\n${fichaCliente(cliente)}\n\nCONVOCATORIA\n${fichaConvocatoria(conv)}`,
        }],
    });
    if (r.stop_reason === 'refusal') {
        return { semaforo: 'amarillo', encaje: 0, motivo: 'La IA no pudo evaluarla: revisar a mano.',
            requisito_critico: null, importe_orientativo: null, modelo: r.model };
    }
    if (r.stop_reason === 'max_tokens') throw new Error('respuesta cortada (max_tokens)');
    const datos = JSON.parse(r.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    datos.encaje = Math.max(0, Math.min(100, Math.round(Number(datos.encaje) || 0)));
    datos.modelo = r.model;
    return datos;
}

/** Evalúa con Claude los cruces pendientes. Sin ANTHROPIC_API_KEY no hace nada. */
async function evaluarEncajes(db, config, { clienteId = null, limite = config.encajeLote ?? 60,
    log = console.log, cliente: cli, alAvanzar = () => {} } = {}) {
    if (!config.anthropicApiKey && !cli) return { evaluadas: 0, errores: 0, omitido: true };
    const anthropic = cli || crearCliente(config);
    const { rows } = await db.query(`
        SELECT cc.cliente_id, cc.convocatoria_id
          FROM cliente_convocatoria cc
          JOIN cliente k ON k.id = cc.cliente_id AND k.activo
          JOIN convocatoria c ON c.id = cc.convocatoria_id
         WHERE cc.evaluado_at IS NULL AND cc.estado <> 'descartada'
           AND ($1::bigint IS NULL OR cc.cliente_id = $1)
           AND (c.fecha_limite IS NULL OR c.fecha_limite > now())
         ORDER BY (cc.origen = 'palabra_clave') DESC, c.fecha_limite NULLS LAST
         LIMIT $2`, [clienteId, limite]);
    const fichas = new Map();
    let evaluadas = 0;
    let errores = 0;
    for (const id of new Set(rows.map((f) => f.cliente_id))) {
        fichas.set(id, (await db.query('SELECT * FROM cliente WHERE id = $1', [id])).rows[0]);
    }
    let hechas = 0;
    alAvanzar(0, rows.length);
    // Se evalúan 4 a la vez
    await enParalelo(rows, 4, async (fila) => {
        try {
            const conv = (await db.query('SELECT * FROM convocatoria WHERE id = $1', [fila.convocatoria_id])).rows[0];
            const e = await evaluarUna(anthropic, config, fichas.get(fila.cliente_id), conv);
            await db.query(`
                UPDATE cliente_convocatoria
                   SET semaforo = $3, encaje = $4, motivo = $5, requisito_critico = $6,
                       importe_orientativo = $7, modelo = $8, evaluado_at = now()
                 WHERE cliente_id = $1 AND convocatoria_id = $2`,
            [fila.cliente_id, fila.convocatoria_id, e.semaforo, e.encaje, e.motivo, e.requisito_critico,
                e.importe_orientativo, e.modelo]);
            evaluadas++;
        } catch (err) {
            errores++;
            log(`Encaje: error en cliente ${fila.cliente_id} / convocatoria ${fila.convocatoria_id}: ${err.message}`);
        }
        alAvanzar(++hechas, rows.length);
    });
    if (rows.length) log(`Encaje: ${evaluadas} evaluadas, ${errores} con error`);
    return { evaluadas, errores };
}

// ---------------------------------------------------------------------------
// Sugerencia de palabras clave
// ---------------------------------------------------------------------------

const ESQUEMA_PALABRAS = {
    type: 'object',
    additionalProperties: false,
    required: ['palabras_clave', 'territorios'],
    properties: {
        palabras_clave: { type: 'array', items: { type: 'string' } },
        territorios: { type: 'array', items: { type: 'string' } },
    },
};

/** Propone palabras clave y territorios para buscar convocatorias de este cliente. */
async function sugerirPalabras(config, cliente, { cliente: cli } = {}) {
    if (!config.anthropicApiKey && !cli) throw new Error('Falta ANTHROPIC_API_KEY para sugerir palabras clave');
    const anthropic = cli || crearCliente(config);
    const r = await anthropic.beta.messages.create({
        model: config.modeloTriaje,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_PALABRAS } },
        system: `Eres consultor de subvenciones en Canarias. Propón las palabras y frases cortas que aparecerían
en el TÍTULO de convocatorias de subvenciones, ayudas o licitaciones españolas y europeas que interesen a este cliente:
su sector, su actividad, el tipo de proyecto que quiere financiar (digitalización, eficiencia energética,
contratación, internacionalización, I+D, maquinaria…) y los programas concretos en los que podría entrar.
Entre 10 y 30 palabras clave, en español (y alguna en inglés si busca licitaciones europeas), sin repetir.
Evita términos tan genéricos que coincidirían con casi todo ("empresa", "ayuda", "subvención").
En "territorios" pon los nombres que identifican a los organismos de su zona (comunidad autónoma, isla, municipio).`,
        messages: [{ role: 'user', content: fichaCliente(cliente) }],
    });
    if (r.stop_reason !== 'end_turn') throw new Error('La IA no pudo sugerir palabras clave');
    const datos = JSON.parse(r.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    const limpiar = (l) => [...new Set(l.map((s) => String(s).trim()).filter(Boolean))];
    return { palabras_clave: limpiar(datos.palabras_clave), territorios: limpiar(datos.territorios) };
}

// ---------------------------------------------------------------------------
// Paquete para la skill islaris-subvenciones
// ---------------------------------------------------------------------------

const SEMAFORO = { verde: '🟢 Verde', amarillo: '🟡 Amarillo', rojo: '🔴 Rojo' };

async function oportunidades(db, clienteId, { incluirRojas = false, incluirDescartadas = false, soloIds = null } = {}) {
    const { rows } = await db.query(`
        SELECT * FROM v_oportunidades_cliente
         WHERE cliente_id = $1
           AND ($2 OR semaforo IS DISTINCT FROM 'rojo')
           AND ($3 OR estado <> 'descartada')
           AND ($4::bigint[] IS NULL OR convocatoria_id = ANY ($4))
         ORDER BY CASE semaforo WHEN 'verde' THEN 0 WHEN 'amarillo' THEN 1 WHEN 'rojo' THEN 3 ELSE 2 END,
                  encaje DESC NULLS LAST, fecha_limite NULLS LAST`,
    [clienteId, incluirRojas, incluirDescartadas, soloIds]);
    return rows;
}

function plazoTexto(o) {
    if (o.ventanilla_permanente) return 'ventanilla permanente';
    if (!o.fecha_limite) return 'sin plazo publicado (verificar)';
    return `${fmtFecha(o.fecha_limite)} (${o.dias_restantes} días)`;
}

function importeTexto(o) {
    const v = o.presupuesto_sin_impuestos ?? o.importe_max_ayuda ?? o.valor_estimado;
    const partes = [];
    if (o.importe_orientativo) partes.push(o.importe_orientativo);
    if (v) partes.push(`${o.tipo === 'licitacion' ? 'presupuesto' : 'dotación de la convocatoria'} ${fmtImporte(v, o.moneda)}`);
    return partes.join(' · ') || 'no publicado';
}

/** Texto Markdown que se pega en Claude para continuar con la skill islaris-subvenciones. */
function componerPaqueteIslaris(cliente, ops, { fecha = new Date() } = {}) {
    const lineas = [
        `# Cliente para la skill islaris-subvenciones: ${cliente.razon_social}`,
        '',
        '> Pega este texto en Claude y escribe: «Usa la skill islaris-subvenciones con este cliente. '
        + 'La ficha del paso 1 está completa. Haz el informe exhaustivo del paso 2 partiendo de las '
        + 'convocatorias abiertas que ha detectado el Radar y completa los niveles que el Radar no cubre '
        + '(fondos europeos de gestión directa, préstamos ENISA/ICO/SODECAN, REF Canarias y bonificaciones).»',
        '',
        `Generado por Radar Financiación - Islaris el ${fecha.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long' })}.`,
        '',
        '## Ficha del cliente (paso 1)',
        '',
        fichaCliente(cliente).split('\n').map((l) => `- ${l}`).join('\n'),
        '',
        '## Convocatorias abiertas detectadas por el Radar (punto de partida del paso 2)',
        '',
    ];
    if (!ops.length) lineas.push('El Radar no ha encontrado convocatorias abiertas que encajen todavía.', '');
    ops.forEach((o, i) => {
        lineas.push(
            `### ${i + 1}. ${o.titulo}`,
            `- Organismo: ${o.organismo_texto || 'sin identificar'}`,
            `- Tipo: ${o.tipo === 'licitacion' ? 'licitación' : 'subvención / ayuda'} · fuente ${o.fuente} (${o.external_id})`,
            `- Plazo: ${plazoTexto(o)}`,
            `- Importe: ${importeTexto(o)}`,
            o.semaforo
                ? `- Encaje según el Radar: ${SEMAFORO[o.semaforo]} (${o.encaje}/100). ${o.motivo || ''}`
                : `- Encaje: sin evaluar (coincide por ${o.origen === 'territorio' ? 'territorio' : 'palabras clave'}: ${(o.coincidencias || []).join(', ')})`,
            o.requisito_critico ? `- Requisito crítico a verificar: ${o.requisito_critico}` : null,
            o.estado !== 'sugerida' ? `- Estado en Islaris: ${o.estado.replace('_', ' ')}` : null,
            `- Enlace oficial: ${o.url_original || 'no disponible'}`,
            o.url_bases ? `- Bases reguladoras: ${o.url_bases}` : null,
            o.url_pliego_administrativo ? `- Pliego administrativo: ${o.url_pliego_administrativo}` : null,
            o.url_pliego_tecnico ? `- Pliego técnico: ${o.url_pliego_tecnico}` : null,
            '',
        );
    });
    lineas.push(
        '## Qué no cubre el Radar',
        '',
        '- Lee la BDNS (todas las subvenciones públicas españolas: Estado, Canarias, cabildos y ayuntamientos), '
        + 'el BOE, la Plataforma de Contratación del Sector Público y TED.',
        '- No cubre: programas europeos de gestión directa (Horizon Europe, EIC, LIFE, Digital Europe), '
        + 'préstamos (ENISA, ICO, SODECAN), beneficios fiscales del REF (RIC, ZEC, DIC) ni bonificaciones de '
        + 'cotizaciones. La skill debe completarlos.',
        '- Los datos y el semáforo son una primera criba automática: verificar siempre contra las bases vigentes.',
    );
    return lineas.filter((l) => l !== null).join('\n');
}

async function paqueteIslaris(db, clienteId, opciones = {}) {
    const cliente = (await db.query('SELECT * FROM cliente WHERE id = $1', [clienteId])).rows[0];
    if (!cliente) throw new Error(`No existe el cliente ${clienteId}`);
    return componerPaqueteIslaris(cliente, await oportunidades(db, clienteId, opciones));
}

// ---------------------------------------------------------------------------
// Avisos por correo
// ---------------------------------------------------------------------------

/**
 * Envía un correo con las oportunidades nuevas de cada cliente: semáforo verde o amarillo
 * con encaje ≥ umbral del cliente (o, sin IA, todo lo que coincide). Cada aviso lleva el
 * paquete para pegar en Claude.
 */
async function avisarClientes(db, config, { log = console.log, transporte } = {}) {
    const destino = config.emailAvisos;
    const conIa = Boolean(config.anthropicApiKey);
    const { rows } = await db.query(`
        SELECT o.cliente_id, o.convocatoria_id
          FROM v_oportunidades_cliente o
          JOIN cliente k ON k.id = o.cliente_id AND k.activo
         WHERE o.avisado_at IS NULL AND o.estado <> 'descartada'
           AND (($1 AND o.semaforo IN ('verde', 'amarillo') AND o.encaje >= k.umbral_aviso)
                OR (NOT $1 AND o.evaluado_at IS NULL))`, [conIa]);
    if (!rows.length) return { clientes: 0, avisadas: 0 };
    if (!destino) {
        log(`Avisos de clientes: ${rows.length} oportunidades nuevas, pero falta VIGILANTE_EMAIL_AVISOS`);
        return { clientes: 0, avisadas: 0, pendientes: rows.length };
    }
    const trans = transporte === undefined ? crearTransporte(config) : transporte;
    if (!trans) {
        log(`Avisos de clientes: ${rows.length} oportunidades nuevas, pero no hay SMTP configurado`);
        return { clientes: 0, avisadas: 0, pendientes: rows.length };
    }
    const porCliente = new Map();
    for (const r of rows) {
        if (!porCliente.has(r.cliente_id)) porCliente.set(r.cliente_id, []);
        porCliente.get(r.cliente_id).push(r.convocatoria_id);
    }
    let avisadas = 0;
    for (const [clienteId, ids] of porCliente) {
        const cliente = (await db.query('SELECT * FROM cliente WHERE id = $1', [clienteId])).rows[0];
        const ops = await oportunidades(db, clienteId, { soloIds: ids });
        const paquete = componerPaqueteIslaris(cliente, ops);
        const url = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.puerto}/#cliente=${clienteId}`;
        const resumen = ops.map((o) => `• ${o.semaforo ? `${SEMAFORO[o.semaforo]} ${o.encaje}/100 · ` : ''}${o.titulo}\n  ${o.organismo_texto || ''} · plazo: ${plazoTexto(o)}${o.motivo ? `\n  ${o.motivo}` : ''}\n  ${o.url_original || ''}`).join('\n\n');
        await trans.sendMail({
            from: config.smtp.from,
            to: destino,
            subject: `[Radar Financiación] ${ops.length} oportunidad${ops.length === 1 ? '' : 'es'} para ${cliente.razon_social}`,
            text: `${resumen}\n\nVer en el Radar: ${url}\n\n----- PARA PEGAR EN CLAUDE -----\n\n${paquete}`,
            html: `<p>Oportunidades nuevas para <b>${escapar(cliente.razon_social)}</b> (<a href="${escapar(url)}">ver en el Radar</a>):</p>
                <ul>${ops.map((o) => `<li style="margin-bottom:10px">${o.semaforo ? `${SEMAFORO[o.semaforo]} ${o.encaje}/100 · ` : ''}
                <a href="${escapar(o.url_original)}">${escapar(o.titulo)}</a><br>
                <small>${escapar(o.organismo_texto || '')} · plazo: ${escapar(plazoTexto(o))}</small>
                ${o.motivo ? `<br><small>${escapar(o.motivo)}</small>` : ''}</li>`).join('')}</ul>
                <p><b>Para seguir con Claude:</b> copia el bloque de abajo y pégalo en Claude.</p>
                <pre style="white-space:pre-wrap;background:#f4f6f8;padding:12px;border-radius:6px;font-size:12px">${escapar(paquete)}</pre>`,
        });
        await db.query(`
            UPDATE cliente_convocatoria SET avisado_at = now()
             WHERE cliente_id = $1 AND convocatoria_id = ANY ($2::bigint[])`, [clienteId, ids]);
        avisadas += ids.length;
        log(`Aviso enviado a ${destino}: ${ids.length} oportunidades para ${cliente.razon_social}`);
    }
    return { clientes: porCliente.size, avisadas };
}

module.exports = {
    territoriosDe, compilarClienteBusqueda, pendientesDeEvaluar, coincideCliente, clientesActivos, cruzarClientes,
    evaluarEncajes, sugerirPalabras, fichaCliente, oportunidades, componerPaqueteIslaris, paqueteIslaris,
    avisarClientes, ESQUEMA_ENCAJE,
};
