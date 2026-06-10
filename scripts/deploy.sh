#!/bin/bash
# PHAROS-AI · Deploy script
# Uso: bash scripts/deploy.sh --env staging|production

set -euo pipefail

ENV=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --env) ENV="$2"; shift 2 ;;
        *) echo "Opcion desconocida: $1"; exit 1 ;;
    esac
done

if [[ -z "$ENV" ]]; then
    echo "Uso: bash scripts/deploy.sh --env staging|production"
    exit 1
fi

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "ENV debe ser 'staging' o 'production'"
    exit 1
fi

echo "PHAROS-AI — Deploy a $ENV"
echo "============================================"

# Load environment config.
CONFIG_FILE=".env.$ENV"
if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "No se encontro $CONFIG_FILE. Crea el archivo con las variables de entorno para $ENV."
    exit 1
fi
# shellcheck disable=SC1090
set -a; source "$CONFIG_FILE"; set +a

DEPLOY_HOST="${DEPLOY_HOST:?Falta DEPLOY_HOST en $CONFIG_FILE}"
DEPLOY_USER="${DEPLOY_USER:?Falta DEPLOY_USER en $CONFIG_FILE}"
DEPLOY_PATH="${DEPLOY_PATH:?Falta DEPLOY_PATH en $CONFIG_FILE}"

echo "Host: $DEPLOY_HOST"
echo "Path: $DEPLOY_PATH"
echo ""

# Run tests before deploying.
echo "Ejecutando tests..."
npm test -- --forceExit
echo "Tests OK"

# Sync middleware files (exclude dev artifacts).
echo "Sincronizando middleware IA..."
rsync -az --delete \
    --exclude='node_modules' \
    --exclude='.env*' \
    --exclude='tests/' \
    ai-layer/ \
    "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/ai-layer/"

# Install production dependencies on the remote.
echo "Instalando dependencias en el servidor..."
ssh "$DEPLOY_USER@$DEPLOY_HOST" \
    "cd $DEPLOY_PATH && npm ci --omit=dev"

# Sync Moodle plugins.
echo "Sincronizando plugins Moodle..."
rsync -az --delete \
    moodle-plugins/ \
    "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/moodle-plugins/"

# Sync Moodle theme.
echo "Sincronizando tema Moodle..."
rsync -az --delete \
    moodle-theme/ \
    "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/moodle-theme/"

# Restart middleware (PM2).
echo "Reiniciando middleware..."
ssh "$DEPLOY_USER@$DEPLOY_HOST" \
    "pm2 restart pharos-ai --update-env || pm2 start $DEPLOY_PATH/ai-layer/server.js --name pharos-ai"

# Purge Moodle caches.
echo "Purgando cache Moodle..."
ssh "$DEPLOY_USER@$DEPLOY_HOST" \
    "php ${MOODLE_PATH:-/var/www/moodle}/admin/cli/purge_caches.php"

echo ""
echo "Deploy a $ENV completado."
