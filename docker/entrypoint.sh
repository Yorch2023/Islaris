#!/bin/bash
set -e

MOODLEDATA=/var/moodledata
CONFIG_PERSISTENT="$MOODLEDATA/config.php"

DB_HOST="${DB_HOST:-db}"
DB_NAME="${DB_NAME:-pharos_moodle}"
DB_USER="${DB_USER:-pharos}"
DB_PASS="${DB_PASS:-pharos_db}"

echo "⏳ Esperando base de datos PostgreSQL..."
until PGPASSWORD="$DB_PASS" pg_isready -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -q; do
    sleep 3
done
sleep 1
echo "✅ Base de datos lista."

mkdir -p "$MOODLEDATA"
chown -R www-data:www-data "$MOODLEDATA"

# Detect whether Moodle tables already exist (handles container restarts after install)
TABLES_EXIST=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='mdl_config';" \
    2>/dev/null || echo 0)

if [ "${TABLES_EXIST:-0}" = "1" ]; then
    echo "♻️  Moodle ya instalado — restaurando config.php..."
    if [ -f "$CONFIG_PERSISTENT" ]; then
        cp "$CONFIG_PERSISTENT" /var/www/html/config.php
    elif [ ! -f /var/www/html/config.php ]; then
        # Regenerate config.php from environment variables
        php << PHPEOF
<?php
\$host = getenv('DB_HOST')        ?: 'db';
\$name = getenv('DB_NAME')        ?: 'pharos_moodle';
\$user = getenv('DB_USER')        ?: 'pharos';
\$pass = getenv('DB_PASS')        ?: 'pharos_db';
\$www  = getenv('MOODLE_WWWROOT') ?: 'http://localhost';

\$c  = "<?php\nunset(\\\$CFG);\nglobal \\\$CFG;\n\\\$CFG = new stdClass();\n";
\$c .= "\\\$CFG->dbtype    = 'pgsql';\n\\\$CFG->dblibrary = 'native';\n";
\$c .= "\\\$CFG->dbhost    = '\$host';\n\\\$CFG->dbname    = '\$name';\n";
\$c .= "\\\$CFG->dbuser    = '\$user';\n\\\$CFG->dbpass    = '\$pass';\n";
\$c .= "\\\$CFG->prefix    = 'mdl_';\n";
\$c .= "\\\$CFG->dboptions = array('dbpersist'=>0,'dbport'=>'','dbsocket'=>'');\n";
\$c .= "\\\$CFG->wwwroot   = '\$www';\n\\\$CFG->dataroot  = '/var/moodledata';\n";
\$c .= "\\\$CFG->admin     = 'admin';\n\\\$CFG->directorypermissions = 0777;\n";
\$c .= "require_once(__DIR__ . '/lib/setup.php');\n";
file_put_contents('/var/www/html/config.php', \$c);
PHPEOF
        echo "🔧 config.php regenerado desde variables de entorno."
        cp /var/www/html/config.php "$CONFIG_PERSISTENT"
    fi
    chown www-data:www-data /var/www/html/config.php
    chmod 644 /var/www/html/config.php

    # Always run upgrade in case plugin versions changed after a rebuild.
    echo "🔌 Verificando actualizaciones de plugins..."
    php /var/www/html/admin/cli/upgrade.php --non-interactive
    echo "✅ Plugins actualizados."
else
    echo "🚀 Instalando Moodle por primera vez (unos minutos)..."
    php /var/www/html/admin/cli/install.php \
        --lang=es \
        --wwwroot="${MOODLE_WWWROOT:-http://localhost}" \
        --dataroot="$MOODLEDATA" \
        --dbtype=pgsql \
        --dbhost="$DB_HOST" \
        --dbname="$DB_NAME" \
        --dbuser="$DB_USER" \
        --dbpass="$DB_PASS" \
        --adminuser=admin \
        --adminpass="${MOODLE_ADMINPASS:-PharosAdmin2024!}" \
        --adminemail=admin@pharos-ai.local \
        --fullname="PHAROS-AI" \
        --shortname="PHAROS" \
        --agree-license \
        --non-interactive

    echo "🔌 Instalando plugins PHAROS..."
    php /var/www/html/admin/cli/upgrade.php --non-interactive

    cp /var/www/html/config.php "$CONFIG_PERSISTENT"
    chown www-data:www-data /var/www/html/config.php "$CONFIG_PERSISTENT"
    chmod 644 /var/www/html/config.php "$CONFIG_PERSISTENT"
    chown -R www-data:www-data "$MOODLEDATA"
    echo "🎉 ¡Moodle listo! Accede en http://localhost"
fi

# Always ensure the PHAROS theme is active (survives cache purges and rebuilds).
php -r "
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
set_config('theme', 'pharos');
set_config('sitename', 'PHAROS-AI');
" && echo "🎨 Tema PHAROS-AI activado."

# Purge theme/CSS cache so the next request gets fresh compiled styles.
php /var/www/html/admin/cli/purge_caches.php

# Ensure config.php is always readable by Apache (www-data) regardless of how it was created
if [ -f /var/www/html/config.php ]; then
    chown www-data:www-data /var/www/html/config.php
    chmod 644 /var/www/html/config.php
fi

exec apache2-foreground
