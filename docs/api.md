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

### POST /api/tutor/stream

Igual que `/api/tutor/chat` pero devuelve la respuesta en tiempo real como **Server-Sent Events (SSE)**.

**Rate limit**: comparte el límite de 20 llamadas/hora con `/api/tutor/chat`.

**Body (JSON)**: idéntico a `/api/tutor/chat`.

**Respuesta 200** — `Content-Type: text/event-stream`:

```
data: {"type":"delta","text":"Un "}
data: {"type":"delta","text":"algoritmo"}
data: {"type":"end"}
```

Cada evento `delta` contiene un fragmento de texto. El evento `end` indica fin de la respuesta. Los errores se envían como `data: {"type":"error","message":"..."}`.

**Proxy Moodle**: `ajax-stream.php` en `block_pharos_tutor` — inyecta `MOODLE_SECRET`, valida `sesskey` y hace streaming pass-through al navegador.

---

### POST /api/tutor/recommend

Analiza el progreso del alumno y devuelve una recomendación personalizada de próximos pasos.

**Rate limit**: comparte el límite de 20 llamadas/hora con `/api/tutor/chat`.

**Body (JSON)**:

| Campo           | Tipo   | Requerido | Descripción |
|-----------------|--------|-----------|-------------|
| `userId`        | string | Sí        | ID Moodle del usuario |
| `userName`      | string | No        | Nombre del alumno (personalización) |
| `level`         | number | Sí        | Nivel actual: `1`, `2` o `3` |
| `xp`            | number | Sí        | XP acumulados en el nivel actual (`≥ 0`) |
| `evidenceCount` | number | Sí        | Evidencias enviadas en el nivel actual (`≥ 0`) |
| `lang`          | string | Sí        | `"es"` o `"it"` |

**Respuesta 200**:

```json
{
  "recommendation_type": "next_activity",
  "message": "¡Buen trabajo, Ana! Llevas 60 XP. El siguiente paso recomendado es...",
  "suggested_activities": [
    { "title": "Sesgo en algoritmos de contratación", "reason": "Conecta con tu perfil laboral", "estimated_minutes": 45 }
  ],
  "next_level_hint": "Necesitas una evidencia más para acceder al N2."
}
```

`recommendation_type` puede ser: `next_activity` | `consolidation` | `level_up_ready` | `resources`.

**Proxy Moodle**: `ajax-recommend.php` en `block_pharos_tutor` — consulta XP y evidencias reales desde la BD de Moodle antes de llamar al middleware; el navegador solo envía `lang` y `cmid`.

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

### POST /api/tutor/reflect

Validates a student's written reflection on an AI topic and returns structured feedback. Used to create **process** evidence through platform-native writing, replacing file uploads.

**Rate limit**: 20 llamadas/hora por usuario (comparte el límite de `/api/tutor/chat`).

**Body (JSON)**:

| Campo        | Tipo   | Requerido | Descripción |
|--------------|--------|-----------|-------------|
| `userId`     | string | Sí        | ID Moodle del usuario |
| `lang`       | string | Sí        | `"es"` o `"it"` |
| `level`      | number | Sí        | Nivel del itinerario: `1`, `2` o `3` |
| `reflection` | string | Sí        | Texto de la reflexión (mín. 30 caracteres) |

**Respuesta 200**:

```json
{
  "valid": true,
  "quality": 3,
  "feedback": "Reflexión bien fundamentada. Conectas la dimensión técnica con la ética..."
}
```

`valid` es `true` si `quality ≥ 2`. `quality` va de `1` (superficial) a `3` (profunda).

**Proxy Moodle**: `ajax-reflect.php` en `block_pharos_tutor` — valida `sesskey`, envía la reflexión al middleware y, si `valid = true`, crea automáticamente una evidencia de tipo `process` en la BD de Moodle.

---

### POST /api/advisor/chat

Chat de apoyo pedagógico para docentes: analiza el perfil de aprendizaje de un alumno concreto e implementa estrategias de intervención.

**Rate limit**: 15 llamadas/hora por usuario.

**Body (JSON)**:

| Campo            | Tipo   | Requerido | Descripción |
|------------------|--------|-----------|-------------|
| `userId`         | string | Sí        | ID Moodle del docente |
| `lang`           | string | Sí        | `"es"` o `"it"` |
| `studentProfile` | string | Sí        | Resumen del perfil del alumno (inyectado por PHP, no por el navegador) |
| `messages`       | array  | Sí        | Historial de la conversación: `[{ role, content }]` |

El campo `messages` debe terminar con un mensaje de `role: "user"`. Máximo 10 mensajes. Cada `content` truncado a 2000 caracteres.

**Respuesta 200**:

```json
{ "reply": "Basándome en el perfil, te recomendaría..." }
```

**Proxy Moodle**: `ajax-advisor.php` en `block_pharos_teacher` — consulta los datos reales del alumno desde la BD (nivel, XP, sesiones IA, evidencias) y los inyecta como `studentProfile`. El navegador solo envía el historial de mensajes y el `student_id`.

---

### POST /api/memory/extract

Extrae y actualiza el perfil de aprendizaje del alumno a partir de una conversación con el Tutor IA. Se llama en segundo plano al finalizar cada sesión.

**Rate limit**: 20 llamadas/hora por usuario.

**Body (JSON)**:

| Campo             | Tipo         | Requerido | Descripción |
|-------------------|--------------|-----------|-------------|
| `userId`          | string       | Sí        | ID Moodle del usuario |
| `messages`        | array        | Sí        | Conversación completa: `[{ role, content }]` (mín. 2 entradas) |
| `existingProfile` | object/null  | No        | Perfil almacenado previamente para actualización incremental |

**Respuesta 200**:

```json
{
  "ok": true,
  "profile": {
    "concepts_explored": ["sesgos algorítmicos", "privacidad"],
    "mastery": { "sesgos algorítmicos": 2 },
    "strengths": "Conecta bien la IA con su contexto educativo.",
    "growth_areas": "Necesita profundizar en regulación.",
    "learning_style": "concrete_examples",
    "recurring_questions": ["¿Cómo afectan los sesgos al alumnado?"],
    "context": "Docente de secundaria"
  }
}
```

**Proxy Moodle**: `ajax-memory.php` en `block_pharos_tutor` — pasa el `existingProfile` desde `block_pharos_tutor_memory` y guarda el perfil actualizado en la misma tabla. Nunca expone el contenido de la conversación fuera del navegador.

---

### GET /health

Verificación de estado del servidor.

**Respuesta 200**: `{ "status": "ok", "version": "0.1.0" }`

---

## Integración con Moodle

```
Browser  →  ajax.php            (block_pharos_tutor)    →  /api/tutor/chat          →  Claude API
Browser  →  ajax-stream.php     (block_pharos_tutor)    →  /api/tutor/stream        →  Claude API (SSE)
Browser  →  ajax-recommend.php  (block_pharos_tutor)    →  /api/tutor/recommend     →  Claude API
Browser  →  ajax-reflect.php    (block_pharos_tutor)    →  /api/tutor/reflect       →  Claude API
Browser  →  ajax-memory.php     (block_pharos_tutor)    →  /api/memory/extract      →  Claude API / Groq
Browser  →  ajax-generator.php  (block_pharos_teacher)  →  /api/generator/activity  →  Claude API
Browser  →  ajax-export.php     (block_pharos_teacher)  →  /api/generator/export    →  (sin Claude)
Browser  →  ajax-advisor.php    (block_pharos_teacher)  →  /api/advisor/chat        →  Claude API / Groq
Browser  →  ajax-motivate.php   (block_pharos_teacher)  →  /api/advisor/chat        →  Claude API / Groq
                ↑ todos inyectan MOODLE_SECRET server-side; nunca llega al navegador
```

Todos los proxies validan `sesskey` (CSRF), fuerzan `userId` al usuario Moodle autenticado, y validan/filtran los campos del body antes de reenviarlos. El `MOODLE_SECRET` nunca llega al navegador.
