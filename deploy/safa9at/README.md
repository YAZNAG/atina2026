# Mettre SAFA9AT en ligne sur safa9at.ma

Tout est servi par un seul serveur et un seul domaine :

| Adresse | Contenu |
|---|---|
| `https://safa9at.ma` | l'app web |
| `https://safa9at.ma/api/…` | l'API (`tenders_api`, pm2 `safa9at-api`, port 4100) |
| `https://safa9at.ma/safa9at.apk` | l'APK Android à télécharger |
| `https://safa9at.ma/safa9at-demo.apk` | l'APK de démonstration (avis d'exemple) |

## 1. Le domaine

1. Achetez `safa9at.ma` chez un bureau d'enregistrement agréé par l'ANRT, si ce n'est pas
   déjà fait.
2. Dans sa zone DNS, créez deux enregistrements **A** vers l'adresse IP du serveur :
   `safa9at.ma` et `www.safa9at.ma`. Le changement prend de quelques minutes à quelques
   heures.

Le serveur peut être celui d'ATINA : SAFA9AT utilise son propre port (4100), son
propre dossier (`/opt/safa9at`) et son propre site nginx.

## 2. Installation (une commande)

Sur le serveur, en root :

```bash
curl -fsSL https://raw.githubusercontent.com/YAZNAG/atina2026/claude/inspiring-mendel-zyz1z5/deploy/safa9at/install.sh \
  | sudo EMAIL=vous@exemple.ma bash
```

Le script installe ce qui manque (Node.js 22, pm2, nginx, certbot), récupère le code dans
`/opt/safa9at`, lance l'API avec pm2, met en ligne l'app web et les APK, configure nginx
et demande le certificat HTTPS. Relancé plus tard, il met tout à jour.

## 3. Réglages du serveur

Complétez `/opt/safa9at/tenders_api/.env` (créé à la première installation), puis
`pm2 reload safa9at-api` :

- `COLLECT_CONTACT` : **obligatoire** pour collecter les avis (e-mail du responsable) ;
- `ANTHROPIC_API_KEY` : résumés IA ;
- `FCM_SERVICE_ACCOUNT` : notifications push (voir le README de `tenders_api`).

Première collecte, puis vérification :

```bash
cd /opt/safa9at/tenders_api
npm run collect -- --force        # essai réduit : 1 page, 10 fiches
curl https://safa9at.ma/api/meta
```

## 4. Nouvelles versions de l'app

Chaque envoi sur la branche construit l'app sur GitHub (`.github/workflows/safa9at.yml`,
onglet **Actions** du dépôt) et la publie dans **Releases** : `safa9at.apk`,
`safa9at-demo.apk` et `safa9at-web.zip`. Pour la mettre en ligne :

```bash
sudo bash /opt/safa9at/deploy/safa9at/update-web.sh
```

## 5. Signature de l'APK (avant le Play Store)

Sans clé, chaque construction est signée avec une clé de débogage différente : l'APK
s'installe, mais il faut désinstaller l'ancienne version avant d'installer la nouvelle,
et le Play Store le refuse. Pour signer avec votre propre clé :

```bash
keytool -genkeypair -v -keystore safa9at.jks -alias safa9at \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 safa9at.jks > safa9at.jks.b64
```

Dans GitHub, **Settings → Secrets and variables → Actions → New repository secret**,
ajoutez :

| Secret | Valeur |
|---|---|
| `SAFA9AT_KEYSTORE_BASE64` | contenu de `safa9at.jks.b64` |
| `SAFA9AT_KEYSTORE_PASSWORD` | mot de passe du fichier |
| `SAFA9AT_KEY_ALIAS` | `safa9at` |
| `SAFA9AT_KEY_PASSWORD` | mot de passe de la clé |

Gardez `safa9at.jks` et ses mots de passe en lieu sûr : sans eux, impossible de publier
une mise à jour de l'app sur le Play Store.
