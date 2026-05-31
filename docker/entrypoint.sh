#!/bin/bash
set -e

MOODLEDATA=/var/moodledata
CONFIG_PERSISTENT="$MOODLEDATA/config.php"

echo "⏳ Esperando base de datos..."
until (echo > /dev/tcp/${DB_HOST:-db}/3306) 2>/dev/null; do
    sleep 3
done
sleep 2
echo "✅ Base de datos lista."

mkdir -p "$MOODLEDATA"
chown -R www-data:www-data "$MOODLEDATA"

# Detect whether Moodle tables already exist (handles container restarts after install)
TABLES_EXIST=$(php -r "
\$m = @new mysqli(getenv('DB_HOST') ?: 'db', getenv('DB_USER') ?: 'pharos', getenv('DB_PASS') ?: 'pharos_db', getenv('DB_NAME') ?: 'pharos_moodle');
if (\$m->connect_error) { echo 0; exit; }
\$r = \$m->query('SHOW TABLES LIKE \"mdl_config\"');
echo (\$r && \$r->num_rows > 0) ? 1 : 0;
" 2>/dev/null || echo 0)

if [ "$TABLES_EXIST" = "1" ]; then
    echo "♻️  Moodle ya instalado — restaurando config.php..."
    if [ -f "$CONFIG_PERSISTENT" ]; then
        cp "$CONFIG_PERSISTENT" /var/www/html/config.php
    elif [ ! -f /var/www/html/config.php ]; then
        # Regenerate config.php from environment variables
        php << 'PHPEOF'
<?php
$host = getenv('DB_HOST')        ?: 'db';
$name = getenv('DB_NAME')        ?: 'pharos_moodle';
$user = getenv('DB_USER')        ?: 'pharos';
$pass = getenv('DB_PASS')        ?: 'pharos_db';
$www  = getenv('MOODLE_WWWROOT') ?: 'http://localhost';

$c  = "<?php\nunset(\$CFG);\nglobal \$CFG;\n\$CFG = new stdClass();\n";
$c .= "\$CFG->dbtype    = 'mariadb';\n\$CFG->dblibrary = 'native';\n";
$c .= "\$CFG->dbhost    = '$host';\n\$CFG->dbname    = '$name';\n";
$c .= "\$CFG->dbuser    = '$user';\n\$CFG->dbpass    = '$pass';\n";
$c .= "\$CFG->prefix    = 'mdl_';\n";
$c .= "\$CFG->dboptions = array('dbpersist'=>0,'dbport'=>'','dbsocket'=>'');\n";
$c .= "\$CFG->wwwroot   = '$www';\n\$CFG->dataroot  = '/var/moodledata';\n";
$c .= "\$CFG->admin     = 'admin';\n\$CFG->directorypermissions = 0777;\n";
$c .= "require_once(__DIR__ . '/lib/setup.php');\n";
file_put_contents('/var/www/html/config.php', $c);
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

    cp /var/www/html/config.php "$CONFIG_PERSISTENT"
    chown www-data:www-data /var/www/html/config.php "$CONFIG_PERSISTENT"
    chmod 644 /var/www/html/config.php "$CONFIG_PERSISTENT"
    chown -R www-data:www-data "$MOODLEDATA"
    echo "🎉 ¡Moodle listo! Accede en http://localhost"
fi

# Ensure config.php is always readable by Apache (www-data) regardless of how it was created
if [ -f /var/www/html/config.php ]; then
    chown www-data:www-data /var/www/html/config.php
    chmod 644 /var/www/html/config.php
fi

exec apache2-foreground
