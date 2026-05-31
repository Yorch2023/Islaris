<?php
/**
 * Configura el middleware y añade el bloque pharos_tutor al curso.
 * Uso: php setup-tutor-block.php [courseid]
 */
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';

$courseId = isset($argv[1]) ? (int)$argv[1] : 2;

// 1. Configurar middleware
set_config('middleware_url', 'http://middleware:3001', 'block_pharos_tutor');
set_config('moodle_secret',  'pharos_local_secret_2024', 'block_pharos_tutor');
echo "Middleware configurado.\n";

// 2. Ver instancias actuales
echo "\nInstancias pharos_tutor en DB:\n";
foreach ($DB->get_records('block_instances', ['blockname' => 'pharos_tutor']) as $bi) {
    $ctx = $DB->get_record('context', ['id' => $bi->parentcontextid]);
    echo "  id={$bi->id} pagetype={$bi->pagetypepattern} ctxlevel=" . ($ctx->contextlevel ?? '?') . "\n";
}

// 3. Encontrar contexto del curso
$courseCtx = $DB->get_record('context', ['contextlevel' => 50, 'instanceid' => $courseId]);
if (!$courseCtx) {
    echo "\nERROR: No se encuentra contexto para courseid=$courseId\n";
    echo "Cursos disponibles:\n";
    foreach ($DB->get_records_select('course', 'id > 1', [], '', 'id,fullname') as $c) {
        echo "  id={$c->id}: {$c->fullname}\n";
    }
    exit(1);
}

echo "\nContexto del curso encontrado: ctx_id={$courseCtx->id}\n";

// 4. Añadir instancia si no existe
$existing = $DB->get_record('block_instances', [
    'blockname'       => 'pharos_tutor',
    'parentcontextid' => $courseCtx->id,
]);

if ($existing) {
    echo "Instancia ya existe: id={$existing->id}\n";
} else {
    $bi = new stdClass();
    $bi->blockname         = 'pharos_tutor';
    $bi->parentcontextid   = $courseCtx->id;
    $bi->showinsubcontexts = 0;
    $bi->requiredbytheme   = 0;
    $bi->pagetypepattern   = 'course-view-*';
    $bi->subpagepattern    = null;
    $bi->defaultregion     = 'side-pre';
    $bi->defaultweight     = 0;
    $bi->configdata        = '';
    $id = $DB->insert_record('block_instances', $bi);
    context_block::instance($id);
    echo "Instancia creada: id=$id\n";
}

echo "\nListo. Purga las cachés y recarga el curso.\n";
