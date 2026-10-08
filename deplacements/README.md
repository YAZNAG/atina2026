# Gestion des déplacements professionnels — Chambre d'Artisanat Souss Massa

Application web qui couvre tout le cycle d'un déplacement : demande de mission, circuit de
validation, réservations, indemnités au barème, note de frais avec justificatifs, avances,
remboursement, suivi budgétaire et reporting. Les documents produits (ordre de mission, état
des frais, rapport) portent l'en-tête officiel de la Chambre.

| | |
|---|---|
| **API** | Node.js 20+ · Express 4 · Prisma 5 · PostgreSQL 14+ (`backend/`) |
| **Interface** | React 18 · Vite 5 · Tailwind CSS 3 (`frontend/`) |
| **Langue / devise** | Français · dirham (MAD) · fuseau Africa/Casablanca |
| **Tests** | 97 tests automatisés (`cd backend && npm test`) |
| **Documentation** | [Documentation technique](docs/technique.md) · [Guide utilisateur](docs/guide-utilisateur.md) |

## Démarrage rapide (développement)

Prérequis : Node.js 20 ou plus, PostgreSQL 14 ou plus, `pg_dump` dans le PATH pour les sauvegardes.

```bash
# 1. Base de données
createuser -P deplacements          # mot de passe : deplacements
createdb -O deplacements deplacements

# 2. API
cd deplacements/backend
cp .env.example .env                # puis renseigner JWT_SECRET et ENCRYPTION_KEY
npm install
npx prisma migrate deploy
npm run db:seed:demo                # référentiels, barèmes, comptes et missions de démonstration
npm run dev                         # http://localhost:5010

# 3. Interface (autre terminal)
cd deplacements/frontend
npm install
npm run dev                         # http://localhost:5173 (relaie /api vers le port 5010)
```

Générer les secrets :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY (64 caractères hexadécimaux)
```

> **Important** : `ENCRYPTION_KEY` chiffre les CIN, RIB et pièces justificatives. Si elle est perdue,
> ces données sont irrécupérables. Conservez-la hors du serveur, avec les sauvegardes.

### Comptes de démonstration

Mot de passe commun : `Chambre2026!`

| Compte | Rôle |
|---|---|
| `admin@ca-soussmassa.ma` | Administrateur |
| `directeur@ca-soussmassa.ma` | Validateur à périmètre global (Directeur) |
| `chef.spc@ca-soussmassa.ma` | Validateur — chef du service Promotion et commercialisation |
| `chef.sfe@ca-soussmassa.ma` | Validateur — chef du service Formation et encadrement |
| `finance@ca-soussmassa.ma` | Service financier |
| `y.bouzid@ca-soussmassa.ma`, `s.lahcen@…`, `o.amzil@…` | Agents |

Les barèmes et plafonds chargés par le seed sont **indicatifs** : remplacez-les par les valeurs
officielles dans *Administration → Référentiels et barèmes* avant la mise en service.

## Tests

```bash
cd deplacements/backend
npm run test:unit     # calculs (indemnités, plafonds, budget) et circuits, sans base de données
npm test              # tout, y compris les parcours API sur la base deplacements_test
```

Les tests d'API recréent la base `deplacements_test` (URL modifiable via `TEST_DATABASE_URL`).

## Mise en production

```bash
cd deplacements/frontend && npm ci && npm run build      # produit frontend/dist
cd ../backend && npm ci --omit=dev && npx prisma migrate deploy
NODE_ENV=production CRON_ENABLED=true node src/server.js  # sert l'API et l'interface compilée
```

- Placer l'application derrière un reverse proxy HTTPS (Nginx, Caddy…) : le chiffrement en transit
  est assuré par le proxy ; `trust proxy` est activé côté Express.
- Renseigner `APP_URL` (liens des e-mails, CORS) et le serveur SMTP. Sans `SMTP_HOST`, les e-mails
  sont seulement journalisés (*Administration → Journaux → E-mails*).
- `CRON_ENABLED=true` active les tâches planifiées : passage « en cours » (toutes les 15 min),
  rappels et relances (8 h, jours ouvrés), sauvegarde (2 h 30, 30 dernières conservées).
- Exemple de service géré par PM2 : `pm2 start src/server.js --name deplacements-api`.
- Sauvegarder aussi, hors du serveur : le dossier `storage/sauvegardes` et la clé `ENCRYPTION_KEY`.

## Arborescence

```
deplacements/
├── backend/
│   ├── assets/            # en-tête officiel et logo (utilisés dans les PDF)
│   ├── prisma/            # schéma, migrations, données initiales
│   ├── scripts/           # sauvegarde manuelle
│   ├── src/
│   │   ├── domain/        # règles métier pures : indemnités, notes de frais, circuits, budget, droits
│   │   ├── lib/           # PDF, Excel, chiffrement, stockage, e-mails, audit, paramètres
│   │   ├── middlewares/   # authentification, permissions, validation, erreurs
│   │   ├── modules/       # un dossier par domaine (routes + service)
│   │   └── jobs/          # tâches planifiées
│   └── tests/             # unit/ (logique pure) et api/ (parcours complets)
├── frontend/src/
│   ├── pages/             # un écran par fichier (missions/, notes/, parc/, admin/)
│   ├── components/        # mise en page, composants d'interface
│   └── api, context, hooks, lib
└── docs/                  # documentation technique et guide utilisateur
```
