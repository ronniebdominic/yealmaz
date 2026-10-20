#!/usr/bin/env bash
# Ye-Almaz — install the Hikvision attendance bridge on a Raspberry Pi (Zero 2 W or any Pi).
#
# Run on the Pi, from this folder:    sudo ./install.sh
# It asks for the API secret and terminal password, stores them in /etc/yealmaz-bridge.env
# (readable by root only — they are NOT written into the service file), installs a systemd
# service that starts at boot and restarts if it ever stops, and starts it.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo:  sudo ./install.sh" >&2
  exit 1
fi

BRIDGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="${SUDO_USER:-pi}"
ENV_FILE=/etc/yealmaz-bridge.env
UNIT_FILE=/etc/systemd/system/yealmaz-bridge.service

if [ ! -f "$BRIDGE_DIR/hikvision-bridge.js" ]; then
  echo "hikvision-bridge.js not found in $BRIDGE_DIR" >&2
  exit 1
fi

# ── Node.js 18+ (the bridge uses the built-in fetch) ─────────────────────────
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 18 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  echo "Installing Node.js 20..."
  apt-get update -y
  apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node $(node -v)"

# ── Settings ─────────────────────────────────────────────────────────────────
ask() { # ask VAR "prompt" "default" [secret]
  local var="$1" prompt="$2" def="${3:-}" secret="${4:-}" val
  if [ -n "$secret" ]; then
    read -r -s -p "$prompt: " val; echo
  else
    read -r -p "$prompt${def:+ [$def]}: " val
  fi
  printf -v "$var" '%s' "${val:-$def}"
}

ask API_BASE   "Server address"                         "https://yealmaz-production.up.railway.app"
ask SECRET     "ATTENDANCE_DEVICE_SECRET (same as Railway)" "" secret
ask DEVICE_IP  "Hikvision terminal IP"                  "192.168.0.198"
ask DEVICE_USER "Terminal admin username"               "admin"
ask DEVICE_PASS "Terminal admin password"               "" secret

if [ -z "$SECRET" ]; then
  echo "The API secret is required — every punch would be rejected without it." >&2
  exit 1
fi

umask 077
cat > "$ENV_FILE" <<EOF
API_BASE=$API_BASE
ATTENDANCE_DEVICE_SECRET=$SECRET
DEVICE_IP=$DEVICE_IP
DEVICE_USER=$DEVICE_USER
DEVICE_PASSWORD=$DEVICE_PASS
EOF
chmod 600 "$ENV_FILE"
umask 022

# ── Service ──────────────────────────────────────────────────────────────────
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Ye-Almaz Hikvision attendance bridge
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$BRIDGE_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) hikvision-bridge.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

chown -R "$RUN_USER":"$RUN_USER" "$BRIDGE_DIR"
systemctl daemon-reload
systemctl enable yealmaz-bridge >/dev/null
systemctl restart yealmaz-bridge

# ── Keep Wi-Fi from sleeping (a sleeping Pi drops off the network and misses punches) ─
if [ -d /etc/NetworkManager/conf.d ]; then
  printf '[connection]\nwifi.powersave = 2\n' > /etc/NetworkManager/conf.d/yealmaz-wifi-powersave-off.conf
fi
iw dev wlan0 set power_save off 2>/dev/null || true

sleep 3
echo
if curl -fs http://localhost:9000/health >/dev/null; then
  echo "Bridge is running."
  echo "  Pi address: $(hostname -I | awk '{print $1}')   (reserve this in your router so it never changes)"
  echo "  Terminal setting: HTTP Listening -> that address, port 9000, URL /, HTTP"
else
  echo "The bridge did not answer yet. Check:  journalctl -u yealmaz-bridge -n 40 --no-pager" >&2
  exit 1
fi
echo
echo "Useful commands:"
echo "  systemctl status yealmaz-bridge"
echo "  journalctl -u yealmaz-bridge -f          (live log)"
echo "  tail -f $BRIDGE_DIR/data/raw-events.log  (what the terminal sends)"
