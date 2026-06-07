FROM php:8.2-apache

# Dependencias del sistema + extensiones PHP requeridas por Moodle + PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
        libfreetype6-dev libjpeg62-turbo-dev libpng-dev \
        libzip-dev libxml2-dev libcurl4-openssl-dev \
        libonig-dev libicu-dev libxslt1-dev libpq-dev \
        postgresql-client git unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        gd zip xml curl intl mbstring opcache \
        pdo pdo_pgsql pgsql soap xsl exif \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

# Configuración PHP para Moodle
RUN printf 'max_input_vars=5000\nmemory_limit=256M\nupload_max_filesize=100M\npost_max_size=100M\n' \
    > /usr/local/etc/php/conf.d/moodle.ini

# Descargar Moodle 4.3
RUN git clone --depth=1 --branch MOODLE_403_STABLE \
        https://github.com/moodle/moodle.git /var/www/html \
    && chown -R www-data:www-data /var/www/html

# Copiar plugins y tema PHAROS-AI
COPY --chown=www-data:www-data moodle-plugins/block_pharos_tutor      /var/www/html/blocks/pharos_tutor
COPY --chown=www-data:www-data moodle-plugins/block_pharos_teacher    /var/www/html/blocks/pharos_teacher
COPY --chown=www-data:www-data moodle-plugins/block_pharos_community  /var/www/html/blocks/pharos_community
COPY --chown=www-data:www-data moodle-plugins/block_pharos_onboarding /var/www/html/blocks/pharos_onboarding
COPY --chown=www-data:www-data moodle-plugins/mod_pharos_itinerary    /var/www/html/mod/pharos_itinerary
COPY --chown=www-data:www-data moodle-plugins/mod_pharos_badges       /var/www/html/mod/pharos_badges
COPY --chown=www-data:www-data moodle-theme                           /var/www/html/theme/pharos

COPY --chown=www-data:www-data scripts /var/www/scripts

COPY docker/apache.conf  /etc/apache2/sites-enabled/000-default.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
