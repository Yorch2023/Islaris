# PHAROS-AI · Arquitectura técnica detallada

## Visión general

PHAROS-AI se articula en cuatro capas físicas independientes que se comunican mediante APIs REST:

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser del usuario                                             │
│  theme_pharos (Bootstrap 4) · AMD modules · Mustache templates  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼─────────────────────────────────────┐
│  Moodle 4.3 (PHP 8.1 + Apache/Nginx)                            │
│  ├── theme_pharos (Boost child)                                  │
│  ├── block_pharos_tutor    → ajax.php (proxy seguro)            │
│  ├── mod_pharos_itinerary  → XP + niveles                       │
│  └── mod_pharos_badges     → evidencias + Open Badges 3.0       │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP interno + Bearer token
┌────────────────────────────▼─────────────────────────────────────┐
│  Middleware IA (Node.js 20 + Express)                            │
│  ├── POST /api/tutor/chat                                        │
│  ├── POST /api/tutor/stream   (SSE)                              │
│  ├── POST /api/generator/activity                                │
│  ├── POST /api/generator/export  (HTML / DOCX download)         │
│  ├── Auth: MOODLE_SECRET (timing-safe compare)                   │
│  └── Rate limit: 20/h tutor · 10/h generador por usuario        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS (SDK oficial)
┌────────────────────────────▼─────────────────────────────────────┐
│  Anthropic Claude API                                            │
│  Modelo: claude-sonnet-4-5                                       │
│  Stateless — sin almacenamiento en Anthropic                     │
└──────────────────────────────────────────────────────────────────┘
```

## Flujo del Tutor IA

1. El alumno escribe en el chat → `amd/src/tutor-chat.js` → `fetch(ajax.php)`
2. `ajax.php` verifica `sesskey` (CSRF), fuerza `userId = $USER->id`
3. `ajax.php` añade `Authorization: Bearer <MOODLE_SECRET>` y hace `curl` al middleware
4. Middleware valida token → aplica rate limit → sanitiza historial → llama a Claude API
5. Respuesta viaja de vuelta al browser y se renderiza en el chat

El historial se mantiene **en memoria del browser** (array JS). No se persiste en base de datos por diseño (privacidad RGPD). Moodle sí guarda metadatos de sesión (quién usó el bloque, cuándo) con purga automática a 90 días.

## Flujo de evidencias y badges

1. Alumno envía evidencia → `mod_pharos_badges/view.php` (formulario POST)
2. `view.php` llama a `badge_issuer::record_evidence()`
3. `badge_issuer` guarda la evidencia en `pharos_badges_evidence`
4. Si `count >= threshold[level]`, llama a `badge_issuer::issue_badge()`
5. `issue_badge()` busca el badge Moodle por nombre y llama a `$badgeObj->issue()`

## Base de datos

### `pharos_itinerary`
Configuración de cada instancia del módulo de itinerario.

### `pharos_itinerary_progress`
Progreso por usuario: `(itineraryid, userid)` → `level`, `xp`. Índice único.

### `pharos_badges_instance`
Una fila por instancia del módulo de badges en un curso.

### `pharos_badges_evidence`
Evidencias enviadas por los alumnos. Índice compuesto `(userid, courseid, level)`.

## Seguridad

| Amenaza | Mitigación |
|---------|-----------|
| Token del middleware expuesto en el browser | Proxy `ajax.php` en Moodle — el token solo viaja servidor-servidor |
| CSRF en envío de evidencias | `sesskey` de Moodle obligatorio en todos los formularios |
| Timing attack en validación del token | Comparación en tiempo constante en `auth.js` |
| Prompt injection en el tutor | Historial sanitizado (whitelist de roles, truncado por longitud) |
| Rate abuse de la Claude API | Rate limiter por userId: 20/h tutor, 10/h generador |
| XSS en la respuesta del tutor | `textContent` (no `innerHTML`) en el AMD JS |
| SQL injection | Solo métodos de la API Moodle (`$DB->get_records`) |

## RGPD / Privacidad

- Conversaciones del tutor: **no se persisten** en ninguna base de datos del proyecto
- Historial en browser: se pierde al cerrar la pestaña (stateless por diseño)
- Evidencias: almacenadas en servidor UE, purga posible a petición del alumno
- Provider de privacidad: `block_pharos_tutor` declara `null_provider`
- Logs del middleware: solo metadatos (método, ruta, código HTTP) — sin contenido de mensajes
