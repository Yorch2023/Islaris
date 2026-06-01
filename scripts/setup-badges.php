<?php
/**
 * Instala mod_pharos_badges en el curso de demo, crea la instancia del módulo
 * y añade evidencias de demo para los alumnos existentes.
 *
 * Uso: php setup-badges.php [courseid]
 * Ejemplo: docker exec pharos-ai-moodle-1 php /var/www/scripts/setup-badges.php 2
 */
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
require_once($CFG->dirroot . '/course/lib.php');

$courseId = isset($argv[1]) ? (int)$argv[1] : 2;

// ── 1. Verificar curso ────────────────────────────────────────────────────────

$course = $DB->get_record('course', ['id' => $courseId]);
if (!$course) {
    echo "ERROR: No existe el curso con id=$courseId\n";
    exit(1);
}
echo "Curso: [{$course->shortname}] {$course->fullname} (id={$course->id})\n\n";

// ── 2. Verificar / instalar mod_pharos_badges ─────────────────────────────────

$pluginDir = $CFG->dirroot . '/mod/pharos_badges';
if (!is_dir($pluginDir)) {
    echo "ERROR: El directorio del plugin no existe: $pluginDir\n";
    exit(1);
}

$badgesModId = $DB->get_field('modules', 'id', ['name' => 'pharos_badges']);

if (!$badgesModId) {
    echo "Módulo pharos_badges no registrado — instalando manualmente…\n";

    $mod          = new stdClass();
    $mod->name    = 'pharos_badges';
    $mod->cron    = 0;
    $mod->lastcron = 0;
    $mod->search  = '';
    $mod->visible = 1;
    $badgesModId = $DB->insert_record('modules', $mod);
    echo "  → Registrado en modules (id=$badgesModId)\n";

    $dbman     = $DB->get_manager();
    $xmldbfile = new xmldb_file("$pluginDir/db/install.xml");
    if ($xmldbfile->loadXMLStructure()) {
        foreach ($xmldbfile->getStructure()->getTables() as $table) {
            if (!$dbman->table_exists($table)) {
                $dbman->create_table($table);
                echo "  → Tabla {$table->getName()} creada\n";
            } else {
                echo "  → Tabla {$table->getName()} ya existe\n";
            }
        }
    } else {
        echo "ERROR: No se pudo cargar install.xml\n";
        exit(1);
    }

    $capabilities = [];
    require("$pluginDir/db/access.php");
    foreach ($capabilities as $capname => $capdef) {
        if (!$DB->record_exists('capabilities', ['name' => $capname])) {
            $cap               = new stdClass();
            $cap->name         = $capname;
            $cap->captype      = $capdef['captype'];
            $cap->contextlevel = $capdef['contextlevel'];
            $cap->component    = 'mod_pharos_badges';
            $cap->riskbitmask  = $capdef['riskbitmask'] ?? 0;
            $DB->insert_record('capabilities', $cap);
            echo "  → Capacidad $capname registrada\n";
        }
    }

    set_config('version', 2025060100, 'mod_pharos_badges');
    echo "Módulo pharos_badges instalado (module_id=$badgesModId)\n";
} else {
    echo "Módulo pharos_badges ya instalado (module_id=$badgesModId)\n";
}

// ── 3. Asegurar secciones ─────────────────────────────────────────────────────

for ($s = 0; $s <= 3; $s++) {
    if (!$DB->record_exists('course_sections', ['course' => $courseId, 'section' => $s])) {
        $DB->insert_record('course_sections', (object)[
            'course'        => $courseId,
            'section'       => $s,
            'name'          => null,
            'summary'       => '',
            'summaryformat' => 1,
            'sequence'      => '',
            'visible'       => 1,
        ]);
    }
}

// ── 4. Crear instancia del módulo en el curso ─────────────────────────────────

$existingBadges = $DB->get_record('pharos_badges_instance', ['course' => $courseId]);
if ($existingBadges) {
    echo "\nInstancia badges ya existe (id={$existingBadges->id})\n";
    $badgesId = $existingBadges->id;
    $badgesCmId = $DB->get_field('course_modules', 'id', [
        'course'   => $courseId,
        'module'   => $badgesModId,
        'instance' => $badgesId,
    ]);
} else {
    echo "\nCreando instancia de badges…\n";

    $now              = time();
    $inst             = new stdClass();
    $inst->course     = $courseId;
    $inst->name       = 'Mis evidencias y microcredenciales';
    $inst->intro      = '<p>Envía tus evidencias y obtén las microcredenciales PHAROS.</p>';
    $inst->introformat = 1;
    $inst->timecreated  = $now;
    $inst->timemodified = $now;
    $badgesId = $DB->insert_record('pharos_badges_instance', $inst);

    $sec0 = $DB->get_record('course_sections', ['course' => $courseId, 'section' => 0], '*', MUST_EXIST);

    $cm             = new stdClass();
    $cm->course     = $courseId;
    $cm->module     = $badgesModId;
    $cm->instance   = $badgesId;
    $cm->section    = $sec0->id;
    $cm->visible    = 1;
    $cm->added      = $now;
    $cm->completion = 0;
    $badgesCmId = $DB->insert_record('course_modules', $cm);

    $seq = trim($sec0->sequence ?? '');
    $sec0->sequence = $seq === '' ? (string) $badgesCmId : $sec0->sequence . ',' . $badgesCmId;
    $DB->update_record('course_sections', $sec0);

    context_module::instance($badgesCmId);
    echo "Badges creado: pharos_badges_instance.id=$badgesId, cmid=$badgesCmId\n";
}

// ── 5. Añadir evidencias demo para los alumnos ────────────────────────────────

echo "\nEvidencias demo:\n";

// Map of username → evidence data (matching XP levels from setup-itinerary.php).
$demoEvidences = [
    'pharos_s1' => [['level' => 1, 'type' => 'product',  'desc' => 'Diario de IA cotidiana: 5 ejemplos identificados y reflexionados']],
    'pharos_s2' => [
        ['level' => 1, 'type' => 'product',  'desc' => 'Análisis de política de privacidad de WhatsApp'],
        ['level' => 1, 'type' => 'process',  'desc' => 'Reflexión sobre la huella digital en redes sociales'],
    ],
    'pharos_s3' => [
        ['level' => 1, 'type' => 'product',  'desc' => 'Mapa conceptual de herramientas IA cotidianas'],
        ['level' => 1, 'type' => 'process',  'desc' => 'Grabación del proceso de exploración con ChatGPT'],
        ['level' => 2, 'type' => 'product',  'desc' => 'Informe de sesgo en sistema de recomendación de Spotify'],
    ],
    'pharos_s4' => [
        ['level' => 1, 'type' => 'product',  'desc' => 'Análisis comparativo de 3 asistentes de voz'],
        ['level' => 1, 'type' => 'process',  'desc' => 'Diario de uso de IA durante una semana laboral'],
        ['level' => 1, 'type' => 'impact',   'desc' => 'Impacto de la IA en el sector de la educación de adultos'],
        ['level' => 2, 'type' => 'product',  'desc' => 'Evaluación de herramienta IA con rúbrica PHAROS'],
    ],
    'pharos_s5' => [
        ['level' => 1, 'type' => 'product',  'desc' => 'Portfolio de herramientas IA utilizadas'],
        ['level' => 1, 'type' => 'process',  'desc' => 'Proceso de aprendizaje autodidacta con IA'],
        ['level' => 1, 'type' => 'impact',   'desc' => 'Análisis de impacto en empleabilidad'],
        ['level' => 2, 'type' => 'product',  'desc' => 'Caso de estudio: sesgo en contratación algorítmica'],
        ['level' => 2, 'type' => 'process',  'desc' => 'Reflexión crítica sobre el AI Act'],
    ],
    'pharos_s6' => [
        ['level' => 1, 'type' => 'product',  'desc' => 'Guía para docentes: IA en la educación de adultos'],
        ['level' => 1, 'type' => 'process',  'desc' => 'Proceso de diseño de actividad con Generador PHAROS'],
        ['level' => 1, 'type' => 'impact',   'desc' => 'Evaluación de impacto en el aula'],
        ['level' => 2, 'type' => 'product',  'desc' => 'Análisis comparativo de 5 herramientas IA'],
        ['level' => 2, 'type' => 'process',  'desc' => 'Documentación del proceso de facilitación'],
        ['level' => 3, 'type' => 'product',  'desc' => 'Actividad completa diseñada e implementada'],
    ],
];

foreach ($demoEvidences as $username => $evidences) {
    $user = $DB->get_record('user', ['username' => $username], 'id,firstname,lastname');
    if (!$user) {
        echo "  [sin usuario] $username\n";
        continue;
    }

    $existing = $DB->count_records('pharos_badges_evidence', ['userid' => $user->id, 'courseid' => $courseId]);
    if ($existing > 0) {
        echo "  [ya tiene evidencias] {$user->firstname} {$user->lastname} ($existing)\n";
        continue;
    }

    foreach ($evidences as $ev) {
        $DB->insert_record('pharos_badges_evidence', (object)[
            'userid'      => $user->id,
            'courseid'    => $courseId,
            'level'       => $ev['level'],
            'type'        => $ev['type'],
            'description' => $ev['desc'],
            'timecreated' => time() - rand(0, 7 * DAYSECS),
        ]);
    }
    echo "  {$user->firstname} {$user->lastname}: " . count($evidences) . " evidencias\n";
}

// ── 6. Purgar caché del curso ─────────────────────────────────────────────────

rebuild_course_cache($courseId, true);
echo "\nCaché del curso purgada.\n";

echo "\n=== Configuración completa ===\n";
echo "Badges cmid: $badgesCmId\n";
echo "URL alumno: http://localhost/mod/pharos_badges/view.php?id=$badgesCmId\n";
echo "\nRosa Martínez (pharos_s6) tiene 6 evidencias — 3 en N1, 2 en N2, 1 en N3.\n";
echo "Para obtener el badge N1 necesita 3 (ya las tiene).\n";
