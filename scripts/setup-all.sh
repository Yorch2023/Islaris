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

# 5. Purgar cachés finales
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
