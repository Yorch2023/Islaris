<?php
/**
 * Añade el bloque pharos_teacher al curso y crea un docente demo.
 *
 * Uso: php setup-teacher-block.php [courseid]
 * Ejemplo: docker exec pharos-ai-moodle-1 php /var/www/scripts/setup-teacher-block.php 2
 */
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';

$courseId = isset($argv[1]) ? (int)$argv[1] : 2;

// ── 1. Verificar curso ────────────────────────────────────────────────────────

$course = $DB->get_record('course', ['id' => $courseId]);
if (!$course) {
    echo "ERROR: No existe el curso con id=$courseId\n";
    exit(1);
}
echo "Curso: [{$course->shortname}] {$course->fullname}\n\n";

// ── 2. Verificar que el bloque está registrado en mdl_block ──────────────────

$block = $DB->get_record('block', ['name' => 'pharos_teacher']);
if (!$block) {
    echo "ERROR: El bloque pharos_teacher no está en mdl_block.\n";
    echo "Ejecuta: php /var/www/html/admin/cli/upgrade.php --non-interactive\n";
    exit(1);
}
echo "Bloque pharos_teacher registrado (id={$block->id})\n";

// ── 3. Añadir instancia del bloque si no existe ───────────────────────────────

$courseCtx = $DB->get_record('context', ['contextlevel' => 50, 'instanceid' => $courseId]);
if (!$courseCtx) {
    echo "ERROR: No se encuentra contexto para el curso.\n";
    exit(1);
}

$existing = $DB->get_record('block_instances', [
    'blockname'       => 'pharos_teacher',
    'parentcontextid' => $courseCtx->id,
]);

if ($existing) {
    echo "Instancia ya existe (id={$existing->id})\n";
} else {
    $bi                    = new stdClass();
    $bi->blockname         = 'pharos_teacher';
    $bi->parentcontextid   = $courseCtx->id;
    $bi->showinsubcontexts = 0;
    $bi->requiredbytheme   = 0;
    $bi->pagetypepattern   = 'course-view-*';
    $bi->subpagepattern    = null;
    $bi->defaultregion     = 'side-pre';
    $bi->defaultweight     = -1; // above the tutor block
    $bi->configdata        = '';
    $id = $DB->insert_record('block_instances', $bi);
    context_block::instance($id);
    echo "Instancia pharos_teacher creada (id=$id)\n";
}

// ── 4. Crear docente demo si no existe ───────────────────────────────────────

$teacherRole = $DB->get_field('role', 'id', ['shortname' => 'editingteacher']);
$courseCtxObj = context_course::instance($courseId);

$teacher = $DB->get_record('user', ['username' => 'pharos_teacher1']);
if (!$teacher) {
    $teacher                  = new stdClass();
    $teacher->auth            = 'manual';
    $teacher->confirmed       = 1;
    $teacher->mnethostid      = $CFG->mnet_localhost_id;
    $teacher->username        = 'pharos_teacher1';
    $teacher->password        = hash_internal_user_password('Pharos2024!');
    $teacher->firstname       = 'Ana';
    $teacher->lastname        = 'López';
    $teacher->email           = 'pharos_teacher1@demo.pharos.eu';
    $teacher->lang            = 'es';
    $teacher->timecreated     = time();
    $teacher->timemodified    = time();
    $teacher->id              = $DB->insert_record('user', $teacher);
    echo "Docente creado: Ana López (pharos_teacher1)\n";
} else {
    echo "Docente ya existe: {$teacher->firstname} {$teacher->lastname}\n";
}

// Matricular como editingteacher si no lo está.
$enrolled = $DB->record_exists('role_assignments', [
    'userid'    => $teacher->id,
    'roleid'    => $teacherRole,
    'contextid' => $courseCtxObj->id,
]);
if (!$enrolled) {
    $enrolMethod = $DB->get_record('enrol', ['courseid' => $courseId, 'enrol' => 'manual']);
    if ($enrolMethod) {
        $enrolPlugin = enrol_get_plugin('manual');
        $enrolPlugin->enrol_user($enrolMethod, $teacher->id, $teacherRole);
        echo "Docente matriculado con rol editingteacher.\n";
    } else {
        role_assign($teacherRole, $teacher->id, $courseCtxObj->id);
        echo "Rol editingteacher asignado directamente.\n";
    }
} else {
    echo "Docente ya matriculado.\n";
}

echo "\n=== Listo ===\n";
echo "Accede como docente: pharos_teacher1 / Pharos2024!\n";
echo "El bloque 'Panel docente PHAROS' aparece en el cajón de bloques (❯) del curso.\n";
echo "URL directa al curso: http://localhost/course/view.php?id=$courseId\n";
echo "\nPurga cachés si el bloque no aparece:\n";
echo "  docker exec pharos-ai-moodle-1 php /var/www/html/admin/cli/purge_caches.php\n";
