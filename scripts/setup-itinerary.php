<?php
/**
 * Instala mod_pharos_itinerary en el curso de demo, crea actividades de ejemplo
 * para cada nivel y configura el progreso de alumnos demo.
 *
 * Uso: php setup-itinerary.php [courseid]
 * Ejemplo: docker exec -i pharos-moodle php /var/www/scripts/setup-itinerary.php 2
 */
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/mod/pharos_itinerary/lib.php');

$courseId = isset($argv[1]) ? (int)$argv[1] : 2;

// ── 1. Verificar que el curso existe ─────────────────────────────────────────

$course = $DB->get_record('course', ['id' => $courseId]);
if (!$course) {
    echo "ERROR: No existe el curso con id=$courseId\n";
    echo "Cursos disponibles:\n";
    foreach ($DB->get_records_select('course', 'id > 1', [], 'id ASC', 'id,fullname,shortname') as $c) {
        echo "  id={$c->id}: {$c->shortname} — {$c->fullname}\n";
    }
    exit(1);
}
echo "Curso: [{$course->shortname}] {$course->fullname} (id={$course->id})\n\n";

// ── 2. Verificar que el módulo pharos_itinerary está instalado ────────────────

$itineraryModId = $DB->get_field('modules', 'id', ['name' => 'pharos_itinerary']);
if (!$itineraryModId) {
    echo "ERROR: El módulo 'pharos_itinerary' no está en la tabla modules.\n";
    echo "Asegúrate de que el plugin está en /var/www/html/mod/pharos_itinerary/ y\n";
    echo "de haber ejecutado: php /var/www/html/admin/cli/upgrade.php --non-interactive\n";
    exit(1);
}
echo "Módulo pharos_itinerary instalado (module_id={$itineraryModId})\n";

$pageModId = $DB->get_field('modules', 'id', ['name' => 'page']);
if (!$pageModId) {
    echo "ERROR: El módulo 'page' no está instalado en Moodle.\n";
    exit(1);
}

// ── 3. Asegurar que el formato del curso soporta secciones ───────────────────

// Ensure sections 0–3 exist.
for ($s = 0; $s <= 3; $s++) {
    $sec = $DB->get_record('course_sections', ['course' => $courseId, 'section' => $s]);
    if (!$sec) {
        $sec          = new stdClass();
        $sec->course  = $courseId;
        $sec->section = $s;
        $sec->name    = null;
        $sec->summary = '';
        $sec->summaryformat = 1;
        $sec->sequence = '';
        $sec->visible  = 1;
        $DB->insert_record('course_sections', $sec);
        echo "Sección $s creada.\n";
    }
}

// ── 4. Helper: crear una page y un course_module ─────────────────────────────

/**
 * Inserts a page activity and its course_module row.
 * Returns the cmid.
 */
function create_page_cm(int $courseId, int $pageModId, int $sectionNum, string $name, string $html): int {
    global $DB;

    // Insert page content.
    $page                = new stdClass();
    $page->course        = $courseId;
    $page->name          = $name;
    $page->intro         = '';
    $page->introformat   = 1;
    $page->content       = $html;
    $page->contentformat = 1;
    $page->display       = 5; // PAGE_DISPLAY_EMBED
    $page->displayoptions= serialize(['printheading' => 1, 'printintro' => 0, 'printlastmodified' => 1]);
    $page->timecreated   = time();
    $page->timemodified  = time();
    $pageId = $DB->insert_record('page', $page);

    // Get / refresh section row.
    $sec = $DB->get_record('course_sections', ['course' => $courseId, 'section' => $sectionNum], '*', MUST_EXIST);

    // Insert course_module.
    $cm            = new stdClass();
    $cm->course    = $courseId;
    $cm->module    = $pageModId;
    $cm->instance  = $pageId;
    $cm->section   = $sec->id;
    $cm->visible   = 1;
    $cm->added     = time();
    $cm->completion = 1; // COMPLETION_TRACKING_MANUAL
    $cmId = $DB->insert_record('course_modules', $cm);

    // Add cm to section sequence.
    $seq = trim($sec->sequence ?? '');
    $sec->sequence = $seq === '' ? (string) $cmId : $sec->sequence . ',' . $cmId;
    $DB->update_record('course_sections', $sec);

    // Instantiate context so Moodle's capability system works.
    context_module::instance($cmId);

    return $cmId;
}

// ── 5. Definir actividades demo ───────────────────────────────────────────────

$demoActivities = [
    1 => [
        [
            'name' => 'N1.1 — ¿Qué es la IA? Reconoce la IA en tu vida cotidiana',
            'html' => '<h3>Actividad N1.1</h3>
<p>La inteligencia artificial ya forma parte de nuestra vida diaria: recomendaciones de Netflix, filtros de correo no deseado, asistentes de voz, traducciones automáticas…</p>
<h4>¿Qué harás?</h4>
<ol>
  <li>Durante un día, anota 5 momentos en que uses o encuentres IA (apps, servicios, trabajo…).</li>
  <li>Para cada caso, reflexiona: ¿qué datos usa? ¿qué decide? ¿quién se beneficia?</li>
  <li>Comparte tus ejemplos en el foro de nivel 1.</li>
</ol>
<p><strong>Evidencia:</strong> captura de pantalla + reflexión escrita (150 palabras).</p>',
        ],
        [
            'name' => 'N1.2 — Privacidad y datos: qué dejas en la red',
            'html' => '<h3>Actividad N1.2</h3>
<p>Cada vez que usas una app, dejas una huella digital. ¿Sabes qué datos recopila la IA de tus servicios habituales?</p>
<h4>¿Qué harás?</h4>
<ol>
  <li>Revisa la política de privacidad de una app que uses a diario (WhatsApp, Google Maps, etc.).</li>
  <li>Identifica: ¿qué datos recogen? ¿para qué los usan? ¿con quién los comparten?</li>
  <li>Redacta un párrafo sobre los riesgos y cómo puedes protegerte.</li>
</ol>
<p><strong>Marco de referencia:</strong> DigComp 3.0 — Área 2: Seguridad.</p>
<p><strong>Evidencia:</strong> análisis escrito de la política de privacidad.</p>',
        ],
    ],
    2 => [
        [
            'name' => 'N2.1 — Sesgos algorítmicos: los prejuicios de la IA',
            'html' => '<h3>Actividad N2.1</h3>
<p>Los sistemas de IA aprenden de datos históricos. Si esos datos reflejan desigualdades, la IA las amplifica.</p>
<h4>¿Qué harás?</h4>
<ol>
  <li>Investiga un caso real de sesgo algorítmico (COMPAS, contratación de Amazon, reconocimiento facial…).</li>
  <li>Analiza: ¿qué datos generaron el sesgo? ¿qué colectivos resultaron perjudicados? ¿cómo se detectó?</li>
  <li>Propón tres medidas concretas para reducirlo.</li>
</ol>
<p><strong>Marco de referencia:</strong> AI Act europeo (Art. 9 — Gestión de riesgos).</p>
<p><strong>Evidencia:</strong> informe de análisis + propuesta de mejora.</p>',
        ],
        [
            'name' => 'N2.2 — Evalúa una herramienta IA con criterios críticos',
            'html' => '<h3>Actividad N2.2</h3>
<p>No todas las herramientas IA son iguales. Aprende a evaluarlas con criterios técnicos y éticos.</p>
<h4>Criterios de evaluación</h4>
<ul>
  <li>Transparencia: ¿explica cómo funciona?</li>
  <li>Privacidad: ¿qué datos recoge y dónde los almacena?</li>
  <li>Accesibilidad: ¿es usable para personas con diversidad funcional?</li>
  <li>Sesgo: ¿ha sido auditada para detectar discriminación?</li>
  <li>Sostenibilidad: ¿cuál es su huella de carbono?</li>
</ul>
<h4>¿Qué harás?</h4>
<p>Elige una herramienta IA (ChatGPT, Gemini, Copilot…) y evalúala con la rúbrica anterior.</p>
<p><strong>Evidencia:</strong> rúbrica completada + conclusión argumentada.</p>',
        ],
    ],
    3 => [
        [
            'name' => 'N3.1 — Diseña una actividad de alfabetización en IA',
            'html' => '<h3>Actividad N3.1</h3>
<p>Has llegado al nivel de facilitación crítica. Es momento de crear y compartir conocimiento.</p>
<h4>¿Qué harás?</h4>
<ol>
  <li>Usa el Generador IA de PHAROS para crear una actividad de 60 min sobre un tema de tu elección.</li>
  <li>Adapta la actividad a tu contexto (adultos, sector profesional, nivel de competencia digital).</li>
  <li>Impleméntala con al menos un grupo real (presencial u online).</li>
  <li>Documenta el proceso: materiales, desarrollo y reflexión post-sesión.</li>
</ol>
<p><strong>Marco:</strong> DigCompEdu — Área 3: Enseñanza y aprendizaje.</p>
<p><strong>Evidencia:</strong> diseño de la actividad + diario reflexivo de la implementación.</p>',
        ],
        [
            'name' => 'N3.2 — Gobernanza de la IA: tu voz como ciudadanía',
            'html' => '<h3>Actividad N3.2</h3>
<p>El AI Act europeo regula la IA de alto riesgo. Como ciudadanía y como docentes, tenemos derecho a participar en ese debate.</p>
<h4>¿Qué harás?</h4>
<ol>
  <li>Lee el resumen del AI Act del consorcio PHAROS (documento compartido en recursos).</li>
  <li>Identifica 2 ámbitos de la educación de personas adultas que afecta directamente.</li>
  <li>Redacta una propuesta de mejora de 300 palabras dirigida a tus representantes educativos.</li>
  <li>Comparte tu propuesta en el foro transnacional España-Italia.</li>
</ol>
<p><strong>Evidencia:</strong> propuesta escrita + participación documentada en el foro.</p>',
        ],
    ],
];

// ── 6. Crear páginas y asignarlas al itinerario ───────────────────────────────

// Check if itinerary already exists.
$existingItinerary = $DB->get_record('pharos_itinerary', ['course' => $courseId]);
if ($existingItinerary) {
    echo "\nItinerario ya existe (id={$existingItinerary->id}). Comprobando actividades…\n";
    $itineraryId = $existingItinerary->id;
    $itineraryCmId = $DB->get_field('course_modules', 'id', [
        'course'   => $courseId,
        'module'   => $itineraryModId,
        'instance' => $itineraryId,
    ]);
} else {
    echo "\nCreando instancia del itinerario…\n";

    // Insert pharos_itinerary record.
    $itinRec               = new stdClass();
    $itinRec->course       = $courseId;
    $itinRec->name         = 'Mi itinerario PHAROS';
    $itinRec->intro        = '<p>Tu recorrido formativo personalizado sobre IA crítica.</p>';
    $itinRec->introformat  = 1;
    $itinRec->startlevel   = 1;
    $itinRec->xp_per_evidence = 10;
    $itinRec->timecreated  = time();
    $itinRec->timemodified = time();
    $itineraryId = $DB->insert_record('pharos_itinerary', $itinRec);

    // Get section 0 for the itinerary module itself.
    $sec0 = $DB->get_record('course_sections', ['course' => $courseId, 'section' => 0], '*', MUST_EXIST);

    // Create course_module for the itinerary.
    $itinCm           = new stdClass();
    $itinCm->course   = $courseId;
    $itinCm->module   = $itineraryModId;
    $itinCm->instance = $itineraryId;
    $itinCm->section  = $sec0->id;
    $itinCm->visible  = 1;
    $itinCm->added    = time();
    $itinCm->completion = 2; // COMPLETION_TRACKING_AUTOMATIC
    $itineraryCmId = $DB->insert_record('course_modules', $itinCm);

    // Add to section 0 sequence.
    $seq = trim($sec0->sequence ?? '');
    $sec0->sequence = $seq === '' ? (string) $itineraryCmId : $sec0->sequence . ',' . $itineraryCmId;
    $DB->update_record('course_sections', $sec0);

    context_module::instance($itineraryCmId);

    echo "Itinerario creado: pharos_itinerary.id=$itineraryId, cmid=$itineraryCmId\n";
}

// Create pages and assign to itinerary per level.
foreach ($demoActivities as $level => $activities) {
    echo "\nNivel $level:\n";
    foreach ($activities as $sortorder => $act) {
        // Skip if already assigned (check by name match in page table + assignment).
        $existingPage = $DB->get_record_select(
            'page',
            'course = :course AND name = :name',
            ['course' => $courseId, 'name' => $act['name']],
            'id'
        );
        if ($existingPage) {
            $existingCm = $DB->get_record('course_modules', [
                'course'   => $courseId,
                'module'   => $pageModId,
                'instance' => $existingPage->id,
            ]);
            $cmid = $existingCm ? $existingCm->id : null;
        } else {
            $cmid = null;
        }

        if ($cmid) {
            // Check if already in itinerary_activity.
            $inItinerary = $DB->record_exists('pharos_itinerary_activity', [
                'itineraryid' => $itineraryId,
                'cmid'        => $cmid,
            ]);
            if ($inItinerary) {
                echo "  [ya existe] {$act['name']}\n";
                continue;
            }
        } else {
            // Create the page and its course_module.
            $cmid = create_page_cm($courseId, $pageModId, $level, $act['name'], $act['html']);
        }

        // Assign to itinerary.
        $pia              = new stdClass();
        $pia->itineraryid = $itineraryId;
        $pia->cmid        = $cmid;
        $pia->level       = $level;
        $pia->sortorder   = $sortorder + 1;
        $DB->insert_record('pharos_itinerary_activity', $pia);
        echo "  [creada] cmid=$cmid — {$act['name']}\n";
    }
}

// ── 7. Crear/actualizar alumnos demo con progreso variado ────────────────────

echo "\nAlumnos demo:\n";

$studentRole = $DB->get_field('role', 'id', ['shortname' => 'student']);
$courseCtx   = context_course::instance($courseId);

$demostudents = [
    ['firstname' => 'Carmen',   'lastname' => 'Díaz',       'username' => 'pharos_s1', 'xp' => 15],
    ['firstname' => 'Luigi',    'lastname' => 'Esposito',   'username' => 'pharos_s2', 'xp' => 60],
    ['firstname' => 'María',    'lastname' => 'Fernández',  'username' => 'pharos_s3', 'xp' => 105],
    ['firstname' => 'Antonio',  'lastname' => 'García',     'username' => 'pharos_s4', 'xp' => 150],
    ['firstname' => 'Giulia',   'lastname' => 'Conti',      'username' => 'pharos_s5', 'xp' => 200],
    ['firstname' => 'Rosa',     'lastname' => 'Martínez',   'username' => 'pharos_s6', 'xp' => 255],
    ['firstname' => 'Pablo',    'lastname' => 'Rodríguez',  'username' => 'pharos_s7', 'xp' => 0],
    ['firstname' => 'Sofia',    'lastname' => 'Ricci',      'username' => 'pharos_s8', 'xp' => 40],
];

foreach ($demostudents as $sd) {
    $user = $DB->get_record('user', ['username' => $sd['username']]);
    if (!$user) {
        $user                   = new stdClass();
        $user->auth             = 'manual';
        $user->confirmed        = 1;
        $user->mnethostid       = $CFG->mnet_localhost_id;
        $user->username         = $sd['username'];
        $user->password         = hash_internal_user_password('Pharos2024!');
        $user->firstname        = $sd['firstname'];
        $user->lastname         = $sd['lastname'];
        $user->email            = $sd['username'] . '@demo.pharos.eu';
        $user->lang             = 'es';
        $user->timecreated      = time();
        $user->timemodified     = time();
        $user->id               = $DB->insert_record('user', $user);
        echo "  Creado: {$sd['firstname']} {$sd['lastname']} ({$sd['username']})\n";
    } else {
        echo "  Existe: {$sd['firstname']} {$sd['lastname']} ({$sd['username']})\n";
    }

    // Enrol in course if not already enrolled.
    $enrolled = $DB->record_exists('role_assignments', [
        'userid'    => $user->id,
        'roleid'    => $studentRole,
        'contextid' => $courseCtx->id,
    ]);
    if (!$enrolled) {
        $enrolMethod = $DB->get_record('enrol', ['courseid' => $courseId, 'enrol' => 'manual']);
        if ($enrolMethod) {
            $enrolPlugin = enrol_get_plugin('manual');
            $enrolPlugin->enrol_user($enrolMethod, $user->id, $studentRole);
        } else {
            // Fallback: direct role assignment + manual enrolment record.
            role_assign($studentRole, $user->id, $courseCtx->id);
        }
    }

    // Set / update XP progress.
    $prog = $DB->get_record('pharos_itinerary_progress', [
        'itineraryid' => $itineraryId,
        'userid'      => $user->id,
    ]);
    if ($prog) {
        if ($prog->xp !== $sd['xp']) {
            $prog->xp           = $sd['xp'];
            // Recalculate level based on XP thresholds.
            $thresholds         = [1 => 100, 2 => 250];
            $prog->level        = 1;
            foreach ($thresholds as $lvl => $threshold) {
                if ($prog->xp >= $threshold) {
                    $prog->level = $lvl + 1;
                }
            }
            $prog->timemodified = time();
            $DB->update_record('pharos_itinerary_progress', $prog);
        }
    } else {
        $thresholds = [1 => 100, 2 => 250];
        $level = 1;
        foreach ($thresholds as $lvl => $threshold) {
            if ($sd['xp'] >= $threshold) {
                $level = $lvl + 1;
            }
        }
        $DB->insert_record('pharos_itinerary_progress', (object) [
            'itineraryid' => $itineraryId,
            'userid'      => $user->id,
            'level'       => $level,
            'xp'          => $sd['xp'],
            'timecreated' => time(),
            'timemodified'=> time(),
        ]);
    }
}

// ── 8. Purgar caché del curso ─────────────────────────────────────────────────

rebuild_course_cache($courseId, true);
echo "\nCaché del curso purgada.\n";

echo "\n=== Configuración completa ===\n";
echo "Itinerario cmid: {$itineraryCmId}\n";
echo "URL alumno: http://localhost/mod/pharos_itinerary/view.php?id={$itineraryCmId}\n";
echo "\nAlumnos demo (contraseña: Pharos2024!):\n";
echo "  pharos_s1 (Carmen Díaz, 15 XP — nivel 1)\n";
echo "  pharos_s3 (María Fernández, 105 XP — nivel 2)\n";
echo "  pharos_s6 (Rosa Martínez, 255 XP — nivel 3)\n";
echo "\nPurga las cachés de Moodle si algo no aparece:\n";
echo "  docker exec pharos-moodle php /var/www/html/admin/cli/purge_caches.php\n";
