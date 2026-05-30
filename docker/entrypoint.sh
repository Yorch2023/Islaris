#!/bin/bash
set -e

MOODLEDATA=/var/moodledata
CONFIG_PERSISTENT="$MOODLEDATA/config.php"

echo "⏳ Esperando base de datos..."
until (echo > /dev/tcp/${DB_HOST:-db}/3306) 2>/dev/null; do
    sleep 3
done
echo "✅ Base de datos lista."

mkdir -p "$MOODLEDATA"
chown -R www-data:www-data "$MOODLEDATA"

# Restore config.php from persistent volume if it was already installed before
if [ -f "$CONFIG_PERSISTENT" ] && [ ! -f /var/www/html/config.php ]; then
    cp "$CONFIG_PERSISTENT" /var/www/html/config.php
    chown www-data:www-data /var/www/html/config.php
    echo "♻️  Configuración Moodle restaurada."
fi

if [ ! -f /var/www/html/config.php ]; then
    echo "🚀 Instalando Moodle por primera vez (unos minutos)..."
    php /var/www/html/admin/cli/install.php \
        --lang=es \
        --wwwroot="${MOODLE_WWWROOT:-http://localhost}" \
        --dataroot="$MOODLEDATA" \
        --dbtype=mariadb \
        --dbhost="${DB_HOST:-db}" \
        --dbname="${DB_NAME:-pharos_moodle}" \
        --dbuser="${DB_USER:-pharos}" \
        --dbpass="${DB_PASS:-pharos_db}" \
        --adminuser=admin \
        --adminpass="${MOODLE_ADMINPASS:-PharosAdmin2024!}" \
        --adminemail=admin@pharos-ai.local \
        --fullname="PHAROS-AI" \
        --shortname="PHAROS" \
        --agree-license \
        --non-interactive

    echo "🔌 Instalando plugins PHAROS..."
    php /var/www/html/admin/cli/upgrade.php --non-interactive

    # Persist config.php in the volume so it survives container rebuilds
    cp /var/www/html/config.php "$CONFIG_PERSISTENT"
    chown -R www-data:www-data /var/www/html/config.php "$MOODLEDATA"

    echo "🎉 ¡Moodle listo! Accede en http://localhost"
fi

exec apache2-foreground
