# Vigilante de subvenciones y licitaciones

Vigila cada día las fuentes oficiales, se queda con lo que encaja con las palabras clave del
grupo, lo clasifica con Claude y lo presenta en un feed para que el equipo lo siga, lo
descarte (con motivo, que alimenta el aprendizaje) o lo pase a expediente.

Funciona sobre el esquema `vigilante` de PostgreSQL definido en
[`db/001_vigilante.sql`](db/001_vigilante.sql), que es independiente del ERP: el vínculo con
un expediente es la referencia de texto `expediente_ref`.

## Qué hace

1. **Lee las fuentes.** Hay lector para:
   | Fuente | Qué trae |
   |---|---|
   | `PLACE` | Plataforma de Contratación del Sector Público (sindicación Atom). Licitaciones abiertas con importes, lotes, CPV y URL de los pliegos (PCAP y PPT), y las adjudicaciones de todo el mercado para la pestaña de competencia. Por defecto lee el feed de perfiles de contratante y el de plataformas autonómicas agregadas (incluye Canarias). |
   | `BDNS` | Base de Datos Nacional de Subvenciones. Listado del periodo y, para lo que encaja, la ficha con plazo, presupuesto y bases. |
   | `BOE` | Sumario diario: secciones III (convocatorias y bases), V-A (contratación) y V-B (extractos). |
   | `TED` | Licitaciones europeas e internacionales, buscando por las palabras clave. |

   El resto de fuentes del catálogo (`fuente`) aparecen en la pestaña *Fuentes* como "sin
   lector": están planificadas en el esquema pero aún no tienen código.
2. **Clasifica por palabras clave** (`palabra_clave`): relevancia alta si coincide una palabra
   *ancla* (programas propios como Neotec o Canarias Aporta) o dos términos específicos;
   media con un término específico o dos marítimos genéricos; baja con un solo término
   genérico como "puerto". La puntuación 0-1000 la calcula la base de datos
   (`calcular_score`) con la relevancia, la urgencia, el importe y las coincidencias.
3. **Detecta lo que no es una oportunidad.** Resoluciones de concesión e información pública
   entran como `ignorada`; consultas preliminares, RFI y anuncios previos llevan su
   `subtipo`; lo que ya ha vencido entra como `vencida`.
4. **Marca duplicados entre fuentes**: mismo órgano y número de expediente, mismo código BDNS
   (BDNS y su extracto en el BOE) o título casi igual con el mismo plazo (PLACSP y TED). La
   original es siempre la fuente más completa (PLACSP o BDNS antes que el BOE).
5. **Resuelve organismos** por DIR3, NIF o alias. Las autoridades portuarias y Puertos del
   Estado se dan de alta solas como organismo objetivo (★), que sube en el feed.
6. **Triaje con Claude**: relevante, dudosa o descartada, con encaje 0-100, una frase de
   motivo, el convocante y el importe interpretados, y la traducción del título si viene en
   otro idioma. Los criterios están en [`config/perfil-empresa.md`](config/perfil-empresa.md)
   y se pueden editar sin tocar código.
7. **Análisis en profundidad bajo demanda** (botón en la ficha): Claude lee el anuncio y los
   pliegos o bases y devuelve veredicto, puntuación, desglose, requisitos, riesgos y una nota
   para clientes en Markdown.
8. **Avisos por email** de las búsquedas guardadas, una sola vez por convocatoria.
9. **Mantenimiento diario** a las 07:15: caduca lo vencido y recalcula la urgencia. Si una
   fuente amplía el plazo de una convocatoria vencida, vuelve sola al feed.
10. **Nada pisa una corrección humana**: lo corregido a mano queda marcado y el vigilante deja
    de actualizarlo. Los cambios que trae la fuente (plazo, presupuesto) quedan en el historial.

## Puesta en marcha

Requisitos: Node.js 20 o superior y PostgreSQL 15 o superior (con las extensiones `pg_trgm`
y `unaccent`, que vienen con PostgreSQL).

```bash
cd vigilante
npm install
cp .env.example .env          # y rellena DATABASE_URL (y ANTHROPIC_API_KEY para el triaje)
node bin/vigilante.js migrar  # crea el esquema "vigilante" con sus datos semilla
node bin/vigilante.js ciclo --dias 7   # primera pasada: vigilar + triaje + avisos
node bin/vigilante.js servidor         # web en http://127.0.0.1:3080
```

El servidor lleva un planificador que lanza cada fuente según su columna `fuente.cron`
(hora de Madrid) y el mantenimiento diario. Si prefieres el cron del sistema, arranca el
servidor con `--sin-planificador` y programa `ciclo` y `mantenimiento`:

```cron
30 8 * * *  cd /ruta/vigilante && node bin/vigilante.js ciclo
15 7 * * *  cd /ruta/vigilante && node bin/vigilante.js mantenimiento
```

### Órdenes

| Orden | Para qué |
|---|---|
| `migrar` | Crea o actualiza el esquema |
| `vigilar [--fuentes PLACE,TED] [--dias N]` | Solo lee fuentes y guarda |
| `triaje [--limite N]` | Clasifica con Claude lo pendiente (`v_pendientes_triaje`) |
| `avisos` | Envía los emails de las búsquedas guardadas |
| `ciclo [--fuentes …] [--dias N]` | Las tres cosas anteriores seguidas |
| `mantenimiento` | `CALL vigilante.mantenimiento_diario()` |
| `analizar <id>` | Análisis en profundidad de una convocatoria |
| `servidor [--sin-planificador]` | Interfaz web y API |

## La interfaz

- **Feed**: pestañas *Relevantes*, *Dudosas*, *Sin triar*, *Descartadas por la IA*, *Todo el
  feed*, *En seguimiento* y *Archivo*, con filtros por texto, tipo, ámbito, relevancia y fuente.
  Desde cada tarjeta se sigue o se descarta; la ficha permite pasar a expediente, archivar,
  repetir el triaje, pedir el análisis en profundidad, marcar o desmarcar duplicados y
  corregir datos.
- **Plazos** (`v_alertas_plazo`), **Duplicados** (`v_posibles_duplicados`) y **Competencia**
  (`v_competencia_organismo`).
- **Palabras clave** y **Búsquedas**: alta, baja y ancla sin tocar la base de datos.
- **Alta manual**: exige fecha límite o marcar ventanilla permanente.
- **Fuentes**: salud de cada lector (`v_salud_fuentes`), acierto del triaje frente a lo que
  decide el equipo (`v_acierto_triaje`) y registro de la última ejecución manual.

Quien revisa se identifica con su nombre (botón arriba a la derecha) y queda en
`revisada_por` y en el feedback de descarte.

## Seguridad

- Por defecto el servidor escucha solo en `127.0.0.1`. Para abrirlo a la red, define
  `VIGILANTE_TOKEN` y ponlo detrás de un proxy con HTTPS.
- Las credenciales van en `.env`, que no se sube al repositorio.

## Pruebas

```bash
npm test                                             # pruebas unitarias
VIGILANTE_TEST_DATABASE_URL=postgres://…/vigilante_test npm test   # y además la de extremo a extremo
```

La prueba de extremo a extremo **borra y recrea el esquema `vigilante`** de la base de datos
que le indiques: usa una base de datos de pruebas. Recorre las cuatro fuentes con muestras
reales de cada formato (`test/fixtures`), el triaje con un cliente simulado, los avisos, la API
y el mantenimiento.

## Pendiente

- Lectores para el resto del catálogo (BOC, CDTI, EU Funding & Tenders, BOAMP, SAM.gov,
  multilaterales…) y para el BORME (`aviso_borme`).
- Los lectores de PLACSP, BDNS, BOE y TED están probados con muestras de sus formatos
  públicos, pero no contra los servicios en vivo (no eran accesibles desde el entorno donde se
  escribió). Conviene una primera pasada vigilada (`vigilar --fuentes X --dias 1`) y revisar
  la pestaña *Fuentes*.
