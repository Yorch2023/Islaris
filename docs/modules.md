# PHAROS-AI · Descripción de módulos

## 1. theme_pharos — Tema Moodle

**Ruta**: `moodle-theme/`
**Tipo**: Tema Boost child

Personalización visual completa de Moodle sin tocar el core. Inyecta las variables SCSS de PHAROS antes del CSS de Boost para sobreescribir Bootstrap 4 a nivel de fuente.

### Archivos clave

| Archivo | Función |
|---------|---------|
| `config.php` | Declara el tema, activa SCSS pipeline y rendererfactory |
| `lib.php` | `theme_pharos_get_main_scss_content()` — encadena variables + Boost + pharos.scss |
| `scss/_variables.scss` | Paleta de colores, tipografía, tokens Bootstrap |
| `scss/pharos.scss` | Estilos de componentes PHAROS (navbar, level badges, XP bar, etc.) |
| `js/pharos-main.js` | Utilidades vanilla: smooth scroll, auto-dismiss alerts, enlaces externos |
| `js/itinerary.js` | Animación XP, acordeón de niveles (fallback sin AMD) |
| `templates/dashboard-student.mustache` | Vista del itinerario del alumno |
| `templates/dashboard-teacher.mustache` | Panel de seguimiento del docente |

---

## 2. block_pharos_tutor — Bloque chat Tutor IA

**Ruta**: `moodle-plugins/block_pharos_tutor/`
**Tipo**: Block plugin (Moodle 4.3)

Muestra un widget de chat conversacional en cualquier página Moodle. Se comunica con el middleware IA a través de un proxy PHP que mantiene el token secreto fuera del navegador.

### Flujo técnico

```
AMD tutor-chat.js → ajax.php → ai-layer/routes/tutor.js → Claude API
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `block_pharos_tutor.php` | Clase del bloque; renderiza template y carga AMD |
| `ajax.php` | Proxy servidor: valida sesskey, fuerza userId, inyecta Bearer token |
| `amd/src/tutor-chat.js` | Gestión del historial en memoria, fetch, renderizado de mensajes |
| `templates/tutor_chat.mustache` | HTML del chat (ARIA live regions, accesible) |
| `styles.css` | Estilos mobile-first del chat |
| `settings.php` | Ajustes admin: URL middleware + token secreto |
| `classes/privacy/provider.php` | RGPD: null_provider (sin datos persistentes) |

### Configuración de administración

En *Administración del sitio > Plugins > Bloques > Tutor IA PHAROS*:
- **URL del middleware**: dirección base del servidor Node.js (ej. `http://localhost:3001`)
- **Token secreto**: valor de `MOODLE_SECRET` del archivo `.env`

---

## 3. mod_pharos_itinerary — Módulo de itinerario visual

**Ruta**: `moodle-plugins/mod_pharos_itinerary/`
**Tipo**: Activity module (Moodle 4.3)

Representa el recorrido formativo personalizado del alumno en tres niveles progresivos. El desbloqueo es por XP acumulado (evidencias), no solo por tiempo.

### Sistema XP

| Nivel | Umbral XP para subir |
|-------|---------------------|
| N1 → N2 | 100 XP |
| N2 → N3 | 250 XP |

### Archivos clave

| Archivo | Función |
|---------|---------|
| `lib.php` | API Moodle + helpers XP (`award_xp`, `get_or_create_progress`) |
| `mod_form.php` | Formulario admin: nombre, nivel inicial, XP por evidencia |
| `view.php` | Renderiza `itinerary_view.mustache` con datos reales de progreso |
| `amd/src/itinerary-progress.js` | Animación XP (IntersectionObserver), acordeón, completion API |
| `templates/itinerary_view.mustache` | Vista de niveles con actividades y enlace a badges |
| `db/install.xml` | Tablas `pharos_itinerary` + `pharos_itinerary_progress` |

---

## 4. mod_pharos_badges — Módulo de microcredenciales

**Ruta**: `moodle-plugins/mod_pharos_badges/`
**Tipo**: Activity module (Moodle 4.3)

Gestiona la recogida de evidencias de los alumnos y la emisión automática de Open Badges 3.0 al alcanzar el umbral por nivel.

### Tipos de evidencia

- **Producto**: artefacto creado (documento, vídeo, proyecto)
- **Proceso**: descripción de cómo se aplicó el aprendizaje
- **Impacto**: efecto en el entorno laboral o comunitario

### Umbrales de emisión

| Nivel | Evidencias necesarias |
|-------|-----------------------|
| N1    | 3 |
| N2    | 4 |
| N3    | 5 |

### Archivos clave

| Archivo | Función |
|---------|---------|
| `classes/badge_issuer.php` | Lógica central: registra evidencias, comprueba umbral, emite badge |
| `view.php` | Formulario de envío de evidencias + historial por nivel |
| `lib.php` | API Moodle (add/update/delete/supports) |
| `templates/evidence_view.mustache` | Vista con barras de progreso y formulario |
| `db/install.xml` | Tablas `pharos_badges_instance` + `pharos_badges_evidence` |

---

## 5. block_pharos_teacher — Panel docente + Generador IA

**Ruta**: `moodle-plugins/block_pharos_teacher/`
**Tipo**: Block plugin (Moodle 4.3)

Panel de seguimiento del docente y acceso al Generador de actividades IA. El bloque muestra progreso individual del alumnado, alertas de inactividad y un enlace directo al generador.

### Flujo técnico del generador

```
generator.php → AMD activity-generator.js → ajax-generator.php → ai-layer/routes/generator.js
                                           ↘ ajax-export.php   → ai-layer/routes/generator.js (export)
```

### Archivos clave

| Archivo | Función |
|---------|---------|
| `block_pharos_teacher.php` | Clase del bloque; consulta progreso del alumnado desde DB |
| `generator.php` | Página dedicada al generador (requiere `block/pharos_teacher:view`) |
| `ajax-generator.php` | Proxy: valida sesskey, fuerza userId, llama al middleware generador |
| `ajax-export.php` | Proxy: reenvía la respuesta binaria (HTML/DOCX) del middleware |
| `amd/src/activity-generator.js` | Gestión del formulario, fetch de actividad, descarga de exportación |
| `amd/src/teacher-dashboard.js` | Interactividad del panel: filtros, tablas de progreso |
| `templates/teacher_dashboard.mustache` | Vista del panel con tabla de alumnos y alertas |
| `templates/generator_view.mustache` | Formulario del generador con ARIA live regions |

### Niveles y exportación

El docente selecciona nivel (N1/N2/N3), tema e idioma (es/it). La actividad generada se puede exportar como HTML imprimible o DOCX (`docx@^8.5.0`).

---

## 6. ai-layer — Middleware Node.js

**Ruta**: `ai-layer/`
**Tipo**: Servidor Express independiente

Proxy entre Moodle y la Claude API de Anthropic. Añade autenticación, rate limiting y los system prompts pedagógicos.

### Endpoints

| Ruta | Descripción |
|------|-------------|
| `POST /api/tutor/chat` | Turno de conversación con el Tutor IA |
| `POST /api/tutor/stream` | Streaming SSE del tutor (respuesta parcial en tiempo real) |
| `POST /api/generator/activity` | Generación de actividad pedagógica para docentes |
| `POST /api/generator/export` | Exportación de la actividad generada (HTML / DOCX) |
| `GET /health` | Health check |

Ver `docs/api.md` para la especificación completa.
