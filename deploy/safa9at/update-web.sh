#!/usr/bin/env bash
# Met en ligne la dernière version de l'app : web (safa9at-web.zip) et APK, tirés de la
# dernière « release » GitHub construite par .github/workflows/safa9at.yml.
set -euo pipefail

REPO="${REPO_SLUG:-YAZNAG/atina2026}"
WEB_DIR="${WEB_DIR:-/var/www/safa9at}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=20" -o "$TMP/releases.json"
read -r TAG WEB_URL APK_URL DEMO_URL < <(node -e '
  const rels = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const r = rels.find((r) => r.assets.some((a) => a.name === "safa9at-web.zip"));
  if (!r) { console.error("Aucune release SAFA9AT trouvée."); process.exit(1); }
  const url = (n) => (r.assets.find((a) => a.name === n) || {}).browser_download_url || "-";
  console.log(r.tag_name, url("safa9at-web.zip"), url("safa9at.apk"), url("safa9at-demo.apk"));
' "$TMP/releases.json")

echo "Version : $TAG"
curl -fsSL "$WEB_URL" -o "$TMP/web.zip"
mkdir "$TMP/web"
unzip -q "$TMP/web.zip" -d "$TMP/web"
[ "$APK_URL" != "-" ] && curl -fsSL "$APK_URL" -o "$TMP/web/safa9at.apk"
[ "$DEMO_URL" != "-" ] && curl -fsSL "$DEMO_URL" -o "$TMP/web/safa9at-demo.apk"
echo "$TAG" > "$TMP/web/release.txt"

# Remplacement d'un seul coup : le site n'est jamais à moitié à jour.
mkdir -p "$(dirname "$WEB_DIR")"
chmod -R a+rX "$TMP/web"
rm -rf "$WEB_DIR.new" "$WEB_DIR.old"
mv "$TMP/web" "$WEB_DIR.new"
[ -d "$WEB_DIR" ] && mv "$WEB_DIR" "$WEB_DIR.old"
mv "$WEB_DIR.new" "$WEB_DIR"
rm -rf "$WEB_DIR.old"
echo "En ligne dans $WEB_DIR."
