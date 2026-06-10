# PHAROS-AI · Instalación de Moodle y configuración del entorno

## Requisitos

| Componente | Versión mínima |
|------------|----------------|
| PHP        | 8.1            |
| PostgreSQL | 15             |
| Node.js    | 20 LTS         |
| Moodle     | 4.3            |
| Ubuntu     | 22.04 LTS      |

---

## 1. Instalar dependencias del sistema (Ubuntu 22.04)

```bash
# Actualizar paquetes
sudo apt update && sudo apt upgrade -y

# PHP 8.1 + extensiones requeridas por Moodle
sudo apt install -y php8.1 php8.1-fpm php8.1-pgsql php8.1-xml \
  php8.1-curl php8.1-zip php8.1-gd php8.1-intl php8.1-mbstring \
  php8.1-soap php8.1-xmlrpc

# PostgreSQL 15
sudo apt install -y postgresql-15

# Nginx
sudo apt install -y nginx

# Node.js 20 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 (gestor de procesos Node.js)
sudo npm install -g pm2
```

---

## 2. Configurar PostgreSQL

```bash
sudo -u postgres psql <<SQL
CREATE USER pharos WITH PASSWORD 'cambia_esta_contrasena';
CREATE DATABASE pharos_moodle OWNER pharos ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE pharos_moodle TO pharos;
SQL
```

---

## 3. Descargar e instalar Moodle

```bash
# Descargar Moodle 4.3
cd /var/www
sudo git clone --depth=1 --branch MOODLE_403_STABLE \
  https://github.com/moodle/moodle.git moodle

# Directorio de datos (fuera del webroot)
sudo mkdir -p /var/moodledata
sudo chown -R www-data:www-data /var/moodledata

# Permisos
sudo chown -R www-data:www-data /var/www/moodle
```

---

## 4. Instalar plugins PHAROS

```bash
# Tema
sudo cp -r /ruta/al/repo/moodle-theme /var/www/moodle/theme/pharos

# Plugins
sudo cp -r /ruta/al/repo/moodle-plugins/block_pharos_tutor \
  /var/www/moodle/blocks/pharos_tutor

sudo cp -r /ruta/al/repo/moodle-plugins/mod_pharos_itinerary \
  /var/www/moodle/mod/pharos_itinerary

sudo cp -r /ruta/al/repo/moodle-plugins/mod_pharos_badges \
  /var/www/moodle/mod/pharos_badges
```

---

## 5. Instalar Moodle vía CLI

```bash
sudo -u www-data php /var/www/moodle/admin/cli/install.php \
  --lang=es \
  --wwwroot=https://tu-moodle.ejemplo.com \
  --dataroot=/var/moodledata \
  --dbtype=pgsql \
  --dbhost=localhost \
  --dbname=pharos_moodle \
  --dbuser=pharos \
  --dbpass=cambia_esta_contrasena \
  --adminuser=admin \
  --adminpass=Admin1234! \
  --adminemail=admin@tu-centro.es \
  --agree-license \
  --non-interactive
```

---

## 6. Configurar Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name tu-moodle.ejemplo.com;

    root /var/www/moodle;
    index index.php;

    ssl_certificate     /etc/letsencrypt/live/tu-moodle.ejemplo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-moodle.ejemplo.com/privkey.pem;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.1-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 7. Configurar e iniciar el middleware IA

```bash
cd /ruta/al/repo

# Instalar dependencias
npm ci --omit=dev

# Crear archivo .env
cp .env.example .env
nano .env   # rellenar ANTHROPIC_API_KEY, MOODLE_SECRET, ALLOWED_ORIGINS

# Iniciar con PM2
pm2 start ai-layer/server.js --name pharos-ai
pm2 save
pm2 startup  # para que arranque con el sistema
```

---

## 8. Configurar el bloque en Moodle

1. Ir a *Administración del sitio > Plugins > Bloques > Tutor IA PHAROS*
2. Establecer **URL del middleware**: `http://localhost:3001` (o la IP del servidor Node.js)
3. Establecer **Token secreto**: el mismo valor que `MOODLE_SECRET` en `.env`
4. Activar el tema PHAROS en *Administración del sitio > Apariencia > Temas*

---

## 9. Verificar la instalación

```bash
# Health check del middleware
curl http://localhost:3001/health

# Purgar caché Moodle después de instalar plugins
sudo -u www-data php /var/www/moodle/admin/cli/purge_caches.php
```
