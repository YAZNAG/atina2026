#!/usr/bin/env bash
# Installe ou met à jour SAFA9AT sur un serveur Ubuntu / Debian (à lancer en root) :
#   - serveur tenders_api (pm2 « safa9at-api », port 4100) ;
#   - app web et APK à télécharger, servis par nginx sur https://safa9at.ma.
#
#   curl -fsSL https://raw.githubusercontent.com/YAZNAG/atina2026/claude/inspiring-mendel-zyz1z5/deploy/safa9at/install.sh | sudo bash
#
# Relancer le script met tout à jour. Prérequis : le domaine pointe vers ce serveur
# (enregistrements DNS A de safa9at.ma et www.safa9at.ma).
set -euo pipefail

DOMAIN="${DOMAIN:-safa9at.ma}"
EMAIL="${EMAIL:-}"   # e-mail pour Let's Encrypt (facultatif)
BRANCH="${BRANCH:-claude/inspiring-mendel-zyz1z5}"
APP_DIR=/opt/safa9at
API_DIR="$APP_DIR/tenders_api"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

say "Outils"
apt-get update -qq
apt-get install -y -qq git nginx unzip curl >/dev/null
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null; then
  echo "Installation de Node.js 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
command -v pm2 >/dev/null || npm install -g pm2 >/dev/null
echo "Node $(node -v), pm2 $(pm2 -v)"

say "Code ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH"
  git -C "$APP_DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  git clone -q --depth 1 --branch "$BRANCH" https://github.com/YAZNAG/atina2026.git "$APP_DIR"
fi
git -C "$APP_DIR" log --oneline -1

say "Serveur tenders_api"
cd "$API_DIR"
npm ci --omit=dev --silent
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s#^CORS_ORIGINS=.*#CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN#" .env
  echo "Fichier $API_DIR/.env créé : renseignez au moins COLLECT_CONTACT (voir README)."
fi
mkdir -p data
pm2 startOrReload "$APP_DIR/deploy/safa9at/ecosystem.config.cjs" --update-env
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
for i in 1 2 3 4 5; do
  curl -fsS http://127.0.0.1:4100/health >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS http://127.0.0.1:4100/health && echo

say "App web et APK"
bash "$APP_DIR/deploy/safa9at/update-web.sh"

say "nginx ($DOMAIN)"
CONF=/etc/nginx/sites-available/safa9at.conf
if [ ! -f "$CONF" ] || ! grep -q "ssl_certificate" "$CONF"; then
  sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/safa9at/nginx.conf" > "$CONF"
fi
ln -sf "$CONF" /etc/nginx/sites-enabled/safa9at.conf
nginx -t
systemctl reload nginx

say "HTTPS (Let's Encrypt)"
if grep -q "ssl_certificate" "$CONF"; then
  echo "Certificat déjà en place."
else
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  if [ -n "$EMAIL" ]; then MAIL=(-m "$EMAIL"); else MAIL=(--register-unsafely-without-email); fi
  certbot --nginx --non-interactive --agree-tos --redirect "${MAIL[@]}" -d "$DOMAIN" -d "www.$DOMAIN" \
    || echo "Certificat refusé : vérifiez que $DOMAIN et www.$DOMAIN pointent vers ce serveur, puis relancez."
fi

say "Terminé"
echo "App web : https://$DOMAIN"
echo "APK     : https://$DOMAIN/safa9at.apk (démonstration : /safa9at-demo.apk)"
echo "API     : https://$DOMAIN/api/meta"
echo "Journal : pm2 logs safa9at-api"
