#!/bin/bash
# ============================================================
# PHAROS-AI — Setup completo post-rebuild
# Ejecutar dentro del contenedor:
#   docker exec pharos-ai-moodle-1 bash /var/www/scripts/setup-all.sh
# ============================================================
set -e

CONTAINER_PHP="php"
MOODLE_DIR="/var/www/html"
SCRIPTS_DIR="/var/www/scripts"
COURSE_ID=2

echo "═══════════════════════════════════════════════"
echo " PHAROS-AI · Setup completo"
echo "═══════════════════════════════════════════════"

# 1. Purgar caches y ejecutar upgrade
echo ""
echo "▶ Purgando cachés..."
$CONTAINER_PHP $MOODLE_DIR/admin/cli/purge_caches.php

echo ""
echo "▶ Ejecutando upgrade.php (instala tablas nuevas)..."
$CONTAINER_PHP $MOODLE_DIR/admin/cli/upgrade.php --non-interactive

# 2. Configurar itinerario y alumnos demo
echo ""
echo "▶ Setup itinerario y alumnos..."
$CONTAINER_PHP $SCRIPTS_DIR/setup-itinerary.php $COURSE_ID

# 3. Configurar badges y evidencias demo
echo ""
echo "▶ Setup badges y evidencias..."
$CONTAINER_PHP $SCRIPTS_DIR/setup-badges.php $COURSE_ID

# 4. Configurar bloque docente
echo ""
echo "▶ Setup panel docente..."
$CONTAINER_PHP $SCRIPTS_DIR/setup-teacher-block.php $COURSE_ID

# 5. Añadir bloque de onboarding al curso (si no existe)
echo ""
echo "▶ Registrando bloque de onboarding..."
$CONTAINER_PHP - <<'PHPSCRIPT'
<?php
define('CLI_SCRIPT', true);
require_once('/var/www/html/config.php');
global $DB;
$courseCtx = context_course::instance(2);
if (!$DB->record_exists('block_instances', [
    'blockname' => 'pharos_onboarding',
    'parentcontextid' => $courseCtx->id,
])) {
    $instance = new stdClass();
    $instance->blockname         = 'pharos_onboarding';
    $instance->parentcontextid   = $courseCtx->id;
    $instance->showinsubcontexts = 0;
    $instance->requiredbytheme   = 0;
    $instance->pagetypepattern   = 'course-view-*';
    $instance->subpagepattern    = null;
    $instance->defaultregion     = 'side-pre';
    $instance->defaultweight     = -10;
    $instance->configdata        = '';
    $instance->timecreated       = time();
    $instance->timemodified      = time();
    $DB->insert_record('block_instances', $instance);
    echo "Bloque pharos_onboarding añadido al curso 2.\n";
} else {
    echo "Bloque pharos_onboarding ya existe.\n";
}
PHPSCRIPT

# 6. Purgar cachés finales
echo ""
echo "▶ Purga final de cachés..."
$CONTAINER_PHP $MOODLE_DIR/admin/cli/purge_caches.php

echo ""
echo "═══════════════════════════════════════════════"
echo " ✅ Setup completado"
echo ""
echo " Accede en http://localhost"
echo " Admin:    admin / PharosAdmin2024!"
echo " Alumno:   pharos_s6 / Pharos2024!  (Rosa — nivel avanzado)"
echo " Docente:  pharos_teacher1 / Pharos2024!"
echo "═══════════════════════════════════════════════"
