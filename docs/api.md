# PHAROS-AI · API del Middleware IA

Base URL: `http://localhost:3001` (desarrollo) / `https://ai.tu-moodle.es` (producción)

Todas las rutas requieren el header `Authorization: Bearer <MOODLE_SECRET>`.

---

## Autenticación

El middleware valida un token secreto compartido (`MOODLE_SECRET` en `.env`). Las llamadas del navegador nunca llevan este token directamente — pasan siempre a través del proxy `ajax.php` de Moodle, que lo inyecta en el servidor.

---

## Endpoints

### POST /api/tutor/chat

Envía un turno de conversación al Tutor IA.

**Rate limit**: 20 llamadas/hora por usuario.

**Body (JSON)**:

| Campo      | Tipo     | Requerido | Descripción |
|------------|----------|-----------|-------------|
| `userId`   | string   | Sí        | ID Moodle del usuario (opaco, solo para rate limiting) |
| `level`    | number   | Sí        | Nivel del itinerario: `1`, `2` o `3` |
| `lang`     | string   | Sí        | Idioma: `"es"` o `"it"` |
| `messages` | array    | Sí        | Historial de la conversación: `[{ role, content }]` |

`messages` debe terminar con un mensaje de `role: "user"`. Máximo 20 mensajes. Cada `content` se trunca a 4000 caracteres.

**Ejemplo**:

```json
{
  "userId": "42",
  "level": 1,
  "lang": "es",
  "messages": [
    { "role": "user", "content": "¿Qué es un algoritmo de IA?" }
  ]
}
```

**Respuesta 200**:

```json
{ "reply": "Un algoritmo de IA es un conjunto de instrucciones..." }
```

**Errores**:

| Código | Causa |
|--------|-------|
| 400    | Parámetro inválido o ausente |
| 401    | Token incorrecto o ausente |
| 429    | Rate limit superado |
| 500    | Error interno del servidor |

---

### POST /api/generator/activity

Genera una actividad pedagógica estructurada para docentes.

**Rate limit**: 10 llamadas/hora por usuario.

**Body (JSON)**:

| Campo       | Tipo   | Requerido | Descripción |
|-------------|--------|-----------|-------------|
| `userId`    | string | Sí        | ID Moodle del usuario |
| `level`     | number | Sí        | `1`, `2` o `3` |
| `lang`      | string | Sí        | `"es"` o `"it"` |
| `topic`     | string | Sí        | Tema de la actividad (máx. 500 chars) |
| `objective` | string | No        | Objetivo específico (máx. 300 chars) |

**Ejemplo**:

```json
{
  "userId": "7",
  "level": 2,
  "lang": "es",
  "topic": "Sesgos algorítmicos en procesos de selección de personal",
  "objective": "Identificar al menos tres tipos de sesgo en un dataset real"
}
```

**Respuesta 200**:

```json
{
  "activity": "**Título**: Detectando sesgos en la selección de personal\n\n**Nivel**: N2..."
}
```

La actividad sigue la estructura definida en `ai-layer/prompts/generator-system.txt`:
Título · Nivel · Duración · Modalidad · Materiales · Objetivos · Desarrollo · Evidencia para badge · Marco de competencias.

---

### POST /api/generator/export

Exporta una actividad ya generada a formato HTML o DOCX.

**Rate limit**: ninguno (opera sobre contenido ya generado; el rate limit se aplica en `/activity`).

**Body (JSON)**:

| Campo      | Tipo   | Requerido | Descripción |
|------------|--------|-----------|-------------|
| `userId`   | string | Sí        | ID Moodle del usuario |
| `activity` | string | Sí        | Texto completo de la actividad generada |
| `format`   | string | Sí        | `"html"` o `"docx"` |
| `lang`     | string | Sí        | `"es"` o `"it"` |

**Respuesta `format=html`** (200):

- `Content-Type: text/html; charset=utf-8`
- `Content-Disposition: attachment; filename="pharos-activity.html"`
- Página HTML imprimible con botón `window.print()`, XSS escaping, `lang` correcto.

**Respuesta `format=docx`** (200):

- `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `Content-Disposition: attachment; filename="pharos-activity.docx"`
- Documento Word con secciones para cada campo de la actividad.

**Errores**:

| Código | Causa |
|--------|-------|
| 400    | `activity`, `format` o `lang` inválidos |
| 401    | Token incorrecto o ausente |
| 500    | Error interno del servidor |

**Proxy Moodle**: `ajax-export.php` en `block_pharos_teacher` — inyecta `MOODLE_SECRET`, valida `sesskey` y devuelve el fichero directamente al navegador como descarga.

---

### GET /health

Verificación de estado del servidor.

**Respuesta 200**: `{ "status": "ok", "version": "0.1.0" }`

---

## Integración con Moodle

```
Browser  →  ajax.php (Moodle)  →  /api/tutor/chat (Node.js)  →  Claude API
                ↑ inyecta MOODLE_SECRET
```

El bloque `block_pharos_tutor` llama a `ajax.php` con el `sesskey` de Moodle para CSRF. El proxy verifica la sesión, fuerza `userId` al usuario autenticado, y añade el `Authorization` header antes de reenviar al middleware.
