#!/bin/bash
set -e

MOODLEDATA=/var/moodledata

echo "⏳ Esperando base de datos..."
until mysqladmin ping -h"${DB_HOST:-db}" -u"${DB_USER:-pharos}" -p"${DB_PASS:-pharos_db}" --silent 2>/dev/null; do
    sleep 3
done
echo "✅ Base de datos lista."

mkdir -p "$MOODLEDATA"
chown -R www-data:www-data "$MOODLEDATA"

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

    chown -R www-data:www-data /var/www/html/config.php "$MOODLEDATA"
    echo "🎉 ¡Moodle listo! Accede en http://localhost"
fi

exec apache2-foreground
