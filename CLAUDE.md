# PHAROS-AI · Plataforma de alfabetización crítica en IA para personas adultas

## Qué es este proyecto

PHAROS-AI es una plataforma de aprendizaje europeo (proyecto Erasmus+ en fase de candidatura) diseñada para la **alfabetización crítica en inteligencia artificial** dirigida a personas adultas y docentes de educación de personas adultas (EPA). El consorcio está formado por la Universidad Europea de Canarias (UEC), el INAPP italiano y OCECAN (Canarias).

La plataforma combina:
- Itinerarios formativos de 3 niveles progresivos sobre IA crítica
- Tutor IA conversacional (Anthropic Claude API)
- Generador de actividades pedagógicas para docentes (Claude API)
- Sistema de microcredenciales (Open Badges 3.0)
- Comunidad de práctica transnacional España-Italia
- Panel de seguimiento docente con analítica

## Stack tecnológico

| Capa | Tecnología | Notas |
|------|-----------|-------|
| LMS base | **Moodle 4.3+** | Open source, PHP 8.1+, PostgreSQL |
| Tema/UX | **Boost child theme** (PHP + SCSS + JS) | Personalización completa sin tocar el core |
| IA — Tutor y Generador | **Anthropic Claude API** (claude-sonnet-4-5) | Node.js middleware via REST |
| Microcredenciales | **Open Badges 3.0** + Moodle Backpack | Plugin nativo Moodle + emisión automática |
| Videoconferencia | **BigBlueButton** (plugin Moodle) | Webinars del consorcio integrados |
| Base de datos | **PostgreSQL 15+** | Preferida sobre MySQL para producción |
| Servidor | **Ubuntu 22.04 LTS** | Compatible OVHcloud / servidor institucional |
| Middleware IA | **Node.js 20 LTS** (Express) | Proxy entre Moodle y Claude API |
| Tests | **Jest** (Node) + **PHPUnit** (Moodle) | |

## Arquitectura (4 capas)

```
┌─────────────────────────────────────────────────────────┐
│  CAPA 4 · Comunidad y reconocimiento                     │
│  Foros transnacionales · Open Badges · Evidencias        │
├─────────────────────────────────────────────────────────┤
│  CAPA 3 · Inteligencia artificial                        │
│  Tutor IA · Generador actividades · Recomendador         │
├─────────────────────────────────────────────────────────┤
│  CAPA 2 · Interfaz y UX (Tema PHAROS)                    │
│  Mobile-first · Itinerario visual · Dashboard            │
├─────────────────────────────────────────────────────────┤
│  CAPA 1 · Moodle 4.3 (LMS base)                         │
│  Cursos · Actividades · Auth SSO · API REST              │
└─────────────────────────────────────────────────────────┘
```

## Estructura del repositorio

```
pharos-ai/
├── CLAUDE.md                          ← Este archivo
├── .env.example                       ← Variables de entorno
├── package.json                       ← Dependencias Node.js (middleware IA)
├── docs/
│   ├── architecture.md                ← Arquitectura detallada
│   ├── modules.md                     ← Descripción de módulos
│   ├── moodle-setup.md                ← Instalación Moodle
│   └── api.md                         ← API del middleware IA
├── moodle-theme/                      ← Tema Boost child (PHP + SCSS + JS)
│   ├── config.php
│   ├── lib.php
│   ├── version.php
│   ├── scss/
│   │   ├── pharos.scss                ← Estilos principales
│   │   └── _variables.scss            ← Variables de color/tipografía
│   ├── js/
│   │   ├── pharos-main.js             ← JS principal del tema
│   │   └── itinerary.js               ← Lógica del itinerario visual
│   └── templates/                     ← Mustache templates Moodle
│       ├── dashboard-student.mustache
│       └── dashboard-teacher.mustache
├── ai-layer/                          ← Middleware Node.js ↔ Claude API
│   ├── server.js                      ← Express server principal
│   ├── routes/
│   │   ├── tutor.js                   ← Endpoint /api/tutor
│   │   └── generator.js               ← Endpoint /api/generator
│   ├── prompts/
│   │   ├── tutor-system.txt           ← System prompt del tutor
│   │   └── generator-system.txt       ← System prompt del generador
│   └── middleware/
│       ├── auth.js                    ← Validación token Moodle
│       └── rateLimit.js               ← Control de uso API
├── moodle-plugins/
│   ├── block_pharos_tutor/            ← Bloque: chat tutor IA (PHP)
│   │   ├── block_pharos_tutor.php
│   │   ├── version.php
│   │   ├── settings.php
│   │   ├── styles.css
│   │   ├── lang/es/block_pharos_tutor.php
│   │   ├── lang/it/block_pharos_tutor.php
│   │   ├── amd/src/tutor-chat.js      ← AMD module para el chat
│   │   ├── templates/tutor_chat.mustache
│   │   └── classes/privacy/provider.php
│   ├── mod_pharos_itinerary/          ← Módulo: itinerario visual (PHP)
│   │   ├── mod_form.php
│   │   ├── view.php
│   │   ├── lib.php
│   │   └── version.php
│   └── mod_pharos_badges/             ← Módulo: emisión automática badges (PHP)
│       ├── classes/
│       │   └── badge_issuer.php
│       └── version.php
└── scripts/
    ├── setup.sh                       ← Setup inicial del entorno
    ├── deploy.sh                      ← Deploy a producción
    └── seed-demo.php                  ← Datos de demo para piloto
```

## Comandos frecuentes

```bash
# Middleware IA (Node.js)
npm install                     # Instalar dependencias
npm run dev                     # Desarrollo con hot-reload (nodemon)
npm run start                   # Producción
npm test                        # Tests Jest

# Moodle (requiere PHP 8.1+ y servidor local)
php admin/cli/install.php       # Instalación inicial Moodle
php admin/cli/upgrade.php       # Actualizar Moodle
php admin/cli/purge_caches.php  # Purgar caché (frecuente en desarrollo)

# Setup completo del entorno de desarrollo
bash scripts/setup.sh

# Deploy
bash scripts/deploy.sh --env staging
bash scripts/deploy.sh --env production
```

## Variables de entorno requeridas

Ver `.env.example`. Las críticas son:
- `ANTHROPIC_API_KEY` — Claude API (tutor + generador)
- `MOODLE_DB_*` — Configuración PostgreSQL
- `MOODLE_SECRET` — Token para validar llamadas al middleware
- `ALLOWED_ORIGINS` — URLs permitidas para CORS

## Módulos funcionales (6)

### 1. Mi Itinerario (alumno)
- **Archivo clave**: `moodle-plugins/mod_pharos_itinerary/`
- Tres niveles progresivos: Fundamentos (N1), IA en la práctica (N2), Facilitación crítica (N3)
- Desbloqueo por evidencias, no solo por tiempo
- XP acumulado como gamificación ligera

### 2. Tutor IA
- **Archivo clave**: `ai-layer/routes/tutor.js` + `moodle-plugins/block_pharos_tutor/`
- Chat conversacional con Claude API (claude-sonnet-4-5)
- Idiomas: español e italiano
- Contexto: responde sobre IA crítica, DigComp, DigCompEdu, AI Act europeo, vida laboral adulta
- Sin memoria entre sesiones distintas (privacidad por diseño)

### 3. Generador de actividades (docente)
- **Archivo clave**: `ai-layer/routes/generator.js`
- Inputs: nivel (1/2/3), tema, objetivo específico (opcional)
- Output: actividad estructurada con título, duración, materiales, pasos y evidencia para badge
- Actividades exportables como PDF/DOCX

### 4. Evidencias y microcredenciales
- **Archivo clave**: `moodle-plugins/mod_pharos_badges/`
- 3 microcredenciales progresivas (Open Badges 3.0)
- Evidencias de 3 tipos: producto, proceso, impacto
- Emisión automática al completar umbral de evidencias
- Alineadas con DigCompEdu 3.0 y EQF

### 5. Panel docente
- **Archivo clave**: `moodle-theme/templates/dashboard-teacher.mustache`
- Progreso individual y grupal del alumnado
- Alertas: alumnos sin actividad > 7 días
- Evidencias pendientes de revisión
- Acceso directo al Generador IA

### 6. Comunidad de práctica transnacional
- Foros Moodle configurados por nivel y país
- Calendario BigBlueButton con webinars España-Italia
- Recursos compartidos entre socios del consorcio

## Convenciones de código

### PHP (Moodle plugins)
- Seguir estrictamente el [Moodle Coding Style](https://moodledev.io/general/development/policies/codingstyle)
- Namespaces: `block_pharos_tutor`, `mod_pharos_itinerary`, `mod_pharos_badges`
- Siempre usar `$DB->get_records()` y métodos de la API Moodle, nunca SQL directo
- Internacionalización obligatoria: todas las cadenas en `/lang/es/` y `/lang/it/`
- Tests PHPUnit en `/tests/` de cada plugin

### JavaScript (AMD modules + vanilla)
- AMD modules para código integrado con Moodle (`amd/src/`)
- ES6+ para el middleware Node.js
- No usar jQuery excepto donde Moodle lo requiera explícitamente
- Clases CSS con prefijo `pharos-` para evitar conflictos con el tema base

### SCSS (tema)
- Variables en `_variables.scss`
- Colores principales: `$pharos-red: #C8102E`, `$pharos-navy: #0D1520`
- Mobile-first: breakpoints estándar Bootstrap 4 (Moodle usa Bootstrap 4)
- No usar `!important` salvo excepciones documentadas

### Node.js (middleware)
- Async/await, no callbacks
- Validar siempre el token Moodle antes de llamar a Claude API
- No loguear el contenido de las conversaciones (privacidad)
- Rate limiting por usuario: máx 20 llamadas/hora al tutor, 10/hora al generador

## Fases de desarrollo

| Fase | Período | Objetivo |
|------|---------|---------|
| Fase 0 · Cimientos | M1-M3 | Moodle + servidor + SSO + tema base |
| Fase 1 · MVP | M3-M6 | Itinerarios + Tutor IA + Panel docente |
| Fase 2 · IA completa | M6-M12 | Generador + Badges + Comunidad |
| Fase 3 · Piloto | M12-M20 | Piloto 3-5 centros por país |
| Fase 4 · Transferencia | M20-M30 | Open source + documentación + escalado |

## Contexto pedagógico (importante para el Tutor IA)

El proyecto opera dentro del marco conceptual PHAROS-AI: alfabetización en IA desde tres dimensiones simultáneas:
1. **Dimensión técnica-funcional**: qué es la IA, cómo funciona, qué herramientas existen
2. **Dimensión crítica-ética**: sesgos algorítmicos, privacidad, derechos, pensamiento crítico
3. **Dimensión ciudadana**: equidad, brecha digital, participación democrática

El Tutor IA debe responder siempre desde estas tres dimensiones, conectando con la vida cotidiana y laboral del alumnado adulto. Marcos de referencia: **DigComp 3.0 (Nov 2025)**, **DigCompEdu**, **EQF**, **AI Act europeo (Art. 4)**.

## Notas de privacidad y RGPD

- Todos los datos almacenados en servidores dentro de la UE
- Conversaciones con el Tutor IA: no se almacenan en Anthropic (stateless)
- Los históricos de chat en Moodle se purgan automáticamente tras 90 días
- DPA firmado con todos los proveedores externos
- Cumplimiento WCAG 2.1 AA obligatorio en toda la interfaz

## Contacto del proyecto

- Coordinador técnico: Jorge Román Montoto (OCECAN)
- Coordinador académico: Manuel Pestano (Universidad Europea de Canarias)
- Socio italiano: Giovanni Bevilacqua (INAPP)
