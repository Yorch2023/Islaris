#!/bin/bash
# PHAROS-AI · Setup script
# Configura el entorno de desarrollo local

set -e

echo "PHAROS-AI — Setup del entorno de desarrollo"
echo "================================================"

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null || echo "none")
if [[ "$NODE_VERSION" == "none" ]]; then
  echo "Node.js no encontrado. Instala Node.js 20 LTS desde https://nodejs.org"
  exit 1
fi
echo "Node.js: $NODE_VERSION"

# Check PHP version
PHP_VERSION=$(php -v 2>/dev/null | head -1 || echo "none")
if [[ "$PHP_VERSION" == "none" ]]; then
  echo "PHP no encontrado. Para desarrollo del tema Moodle necesitaras PHP 8.1+"
else
  echo "PHP: $PHP_VERSION"
fi

# Install Node.js dependencies
echo ""
echo "Instalando dependencias Node.js..."
npm install

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env creado desde .env.example"
  echo "IMPORTANTE: Edita .env con tu ANTHROPIC_API_KEY y el resto de variables"
else
  echo "Archivo .env ya existe"
fi

echo ""
echo "Setup completado."
echo ""
echo "Proximos pasos:"
echo "  1. Edita .env con tus credenciales (especialmente ANTHROPIC_API_KEY)"
echo "  2. Ejecuta 'npm run dev' para iniciar el middleware IA"
echo "  3. Para Moodle: instala XAMPP/Laragon y configura la base de datos PostgreSQL"
echo ""
echo "Documentacion: docs/moodle-setup.md"
