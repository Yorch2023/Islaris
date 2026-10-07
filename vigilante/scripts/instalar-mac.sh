#!/bin/bash
# Instala Radar Financiación - Islaris (el vigilante) en un Mac para que funcione solo:
#  1. Lo arranca al iniciar sesión y lo reinicia si se cae (LaunchAgent).
#  2. Conecta el conector MCP a la app de escritorio de Claude, para que la skill
#     islaris-subvenciones pueda usarlo.
# Uso:  bash scripts/instalar-mac.sh            (instalar o actualizar)
#       bash scripts/instalar-mac.sh --quitar   (desinstalar)
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
ETIQUETA="es.islaris.vigilante"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
LOG="$HOME/Library/Logs/vigilante.log"
CLAUDE_CFG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

if [ -z "$NODE" ]; then echo "No encuentro Node.js. Instálalo desde nodejs.org y vuelve a ejecutar."; exit 1; fi

if [ "${1:-}" = "--quitar" ]; then
  launchctl bootout "gui/$(id -u)/$ETIQUETA" 2>/dev/null || true
  rm -f "$PLIST"
  if [ -f "$CLAUDE_CFG" ]; then
    "$NODE" -e '
      const fs = require("fs"); const f = process.argv[1];
      const c = JSON.parse(fs.readFileSync(f, "utf8"));
      if (c.mcpServers) delete c.mcpServers.vigilante;
      fs.writeFileSync(f, JSON.stringify(c, null, 2));' "$CLAUDE_CFG"
  fi
  echo "Radar Financiación desinstalado (la base de datos y el .env se conservan)."
  exit 0
fi

cd "$DIR"
if [ ! -f .env ]; then echo "Falta el fichero .env en $DIR (copia .env.example y rellénalo)."; exit 1; fi
echo "· Instalando dependencias…"
npm install --silent
echo "· Actualizando la base de datos…"
"$NODE" bin/vigilante.js migrar

echo "· Programando el arranque automático…"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DIR/bin/vigilante.js</string><string>servidor</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>USER</key><string>$(id -un)</string>
    <key>HOME</key><string>$HOME</string>
    <key>LANG</key><string>es_ES.UTF-8</string>
  </dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$ETIQUETA" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "· Conectando el Radar a la app de Claude…"
mkdir -p "$(dirname "$CLAUDE_CFG")"
[ -f "$CLAUDE_CFG" ] && cp "$CLAUDE_CFG" "$CLAUDE_CFG.copia-$(date +%Y%m%d%H%M%S)"
"$NODE" -e '
  const fs = require("fs"); const [f, node, script] = process.argv.slice(1);
  let c = {};
  try { c = JSON.parse(fs.readFileSync(f, "utf8")); } catch { c = {}; }
  c.mcpServers = c.mcpServers || {};
  c.mcpServers.vigilante = { command: node, args: [script] };
  fs.writeFileSync(f, JSON.stringify(c, null, 2));' "$CLAUDE_CFG" "$NODE" "$DIR/mcp/servidor-mcp.js"

sleep 3
if curl -s -o /dev/null "http://127.0.0.1:${VIGILANTE_PUERTO:-3080}/api/config"; then
  echo ""
  echo "Listo. Radar Financiación - Islaris está en marcha en http://127.0.0.1:${VIGILANTE_PUERTO:-3080} y arrancará solo al encender el Mac."
else
  echo ""
  echo "El Radar no responde todavía. Mira el registro: tail -50 \"$LOG\""
  echo "(Si tenías el servidor abierto en una terminal, ciérralo con Control + C: ocupan el mismo puerto.)"
fi
echo "Cierra del todo la app de Claude (Cmd + Q) y vuelve a abrirla para que cargue el conector del Radar."
echo "Postgres.app debe arrancar al iniciar sesión: en Postgres.app > Settings, marca «Automatically start at login»."
