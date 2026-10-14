# API des appels d'offres (Mounaqasa)

Ce serveur collecte les **appels d'offres ouverts** publiés sur le
[portail marocain des marchés publics](https://www.marchespublics.gov.ma/) et les sert à
l'app `mobile/tenders_app`.

**Stack** : Node.js ≥ 22.13 · Express 5 · cheerio · SQLite intégré à Node (`node:sqlite`,
un seul fichier, rien à installer).

## Fonctionnement

1. Le collecteur ouvre la liste des consultations du portail, comme un navigateur.
   Le portail est une application PRADO : changer de page revient à renvoyer le
   formulaire avec son état caché (`PRADO_PAGESTATE`), ce que fait le collecteur.
2. Il affiche 100 résultats par page et parcourt les pages. Le portail trie la liste
   par **date limite décroissante**, donc les avis ouverts arrivent en premier. La
   collecte s'arrête à la première page dont tous les avis sont clôturés : une
   quarantaine de pages, au lieu des ≈ 10 000 pages de l'historique.
3. Pour chaque avis **nouveau ou modifié** (rectificatif, report), il lit la fiche :
   estimation, caution provisoire, visite des lieux, lots, qualifications exigées,
   taille du dossier. Les avis déjà lus ne coûtent aucune requête.
4. Le tout est enregistré dans SQLite, avec un journal de chaque collecte.

Les coordonnées des agents (nom, e-mail, téléphone) affichées sur les fiches ne sont
**pas** collectées.

## Notifications push

Chaque matin à `NOTIFY_AT` (8 h 30 par défaut, heure de Casablanca), le serveur
parcourt les téléphones inscrits et envoie, par Firebase Cloud Messaging (Android et
iOS) :

- **une notification groupée** pour les nouveaux avis qui correspondent aux alertes du
  téléphone (catégories, régions, mots-clés : mêmes règles que dans l'app). Un seul
  avis : la notification ouvre directement sa fiche. Seuls les avis publiés dans la
  semaine comptent, pour que la première collecte n'annonce pas des milliers d'avis
  anciens ;
- **un rappel par avis enregistré** dont la date limite tombe dans le délai choisi (1,
  3 ou 7 jours), trois au plus par jour.

Le même avis n'est jamais signalé deux fois au même téléphone. Les textes partent en
français ou en arabe, selon la langue de l'app. Si Google signale qu'un jeton n'est plus
valable (app désinstallée), le téléphone est retiré. Une panne passagère fait retenter
ce téléphone le lendemain. Un accès refusé par Google arrête la tournée.

L'app inscrit le téléphone (`POST /api/devices`) quand l'utilisateur enregistre ses
alertes et autorise les notifications. Le serveur ne reçoit que le jeton de
notification, la langue, les préférences d'alertes et les identifiants des avis
enregistrés : **aucune donnée personnelle**.

Mise en place, une seule fois :

1. Créez un projet sur la [console Firebase](https://console.firebase.google.com/).
2. Dans *Paramètres du projet → Comptes de service*, cliquez sur *Générer une nouvelle
   clé privée*. Placez le fichier JSON sur le serveur, hors du dépôt, puis indiquez son
   chemin dans `FCM_SERVICE_ACCOUNT`.
3. Configurez l'app (voir le README de `mobile/tenders_app`, section Notifications).

```bash
npm run notify      # envoie la tournée du jour maintenant (pour tester)
```

## Règles de collecte

Le portail est un service public dont dépendent toutes les entreprises
soumissionnaires. Ces règles sont dans le code et couvertes par les tests :

| Règle | Détail |
|---|---|
| Une requête à la fois | Les appels passent dans une file. Il n'y a jamais deux requêtes en parallèle. |
| Pause entre requêtes | 3 s par défaut, **2 s au minimum** (`PMMP_DELAY_MS`). |
| Identité déclarée | `User-Agent: MounaqasaBot/1.0 (…; +<COLLECT_CONTACT>)`. **Sans contact, la collecte refuse de démarrer.** |
| `robots.txt` respecté | Il est lu avant toute page. Une interdiction arrête la collecte. |
| Aucun forçage | Pas de nouvelle tentative, pas de proxy, pas de contournement. Un HTTP 403 ou 429 arrête la collecte immédiatement. |
| Coupe-circuit | La collecte s'arrête après 3 erreurs serveur ou délais dépassés d'affilée (`PMMP_MAX_ERRORS`). |
| Heures creuses | Collecte autorisée de 00:00 à 07:00, heure de Casablanca (`COLLECT_WINDOW`). Hors de cette plage, `--force` ne lance qu'un essai réduit : 1 page de 20 avis et 10 fiches. |
| Une collecte à la fois | Une collecte encore « en cours » bloque la suivante pendant 6 h. |

Avant une mise en production, lisez les conditions d'utilisation du portail. Il est
recommandé de prévenir son exploitant, la Trésorerie générale du Royaume, de cette
collecte.

## Installation

```bash
cd tenders_api
npm install
cp .env.example .env      # puis renseigner au moins COLLECT_CONTACT
```

Variables principales (toutes dans `.env.example`) :

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | port de l'API | `4100` |
| `DB_PATH` | fichier SQLite | `data/tenders.db` |
| `COLLECT_CONTACT` | e-mail ou URL de contact, **obligatoire pour collecter** | — |
| `COLLECT_AT` | heure de la collecte quotidienne (Casablanca), vide = aucune | `02:30` |
| `COLLECT_WINDOW` | plage horaire autorisée | `00:00-07:00` |
| `PMMP_DELAY_MS` | pause entre requêtes (≥ 2000) | `3000` |
| `PMMP_DETAILS_PER_RUN` | fiches lues au plus par collecte | `400` |
| `FCM_SERVICE_ACCOUNT` | fichier JSON du compte de service Firebase, vide = pas de notifications | — |
| `NOTIFY_AT` | heure de la tournée de notifications (Casablanca) | `08:30` |

## Lancer

```bash
npm start                    # API + collecte (COLLECT_AT) + notifications (NOTIFY_AT)
npm run collect              # une collecte maintenant (refusée hors plage horaire)
npm run collect -- --force   # essai réduit en journée : 1 page, 10 fiches
npm run notify               # tournée de notifications maintenant
npm test                     # 51 tests, sans requête vers le portail ni vers Google
```

Codes de sortie de `npm run collect` : `0` succès · `1` échec · `2` refusée (hors plage
ou déjà en cours) · `3` partielle (limite de pages) · `4` arrêtée par le portail (refus,
erreurs répétées, `robots.txt`).

**Première mise en service** : lancez `npm run collect -- --force`, puis vérifiez que
`/api/tenders` renvoie des avis. Si le portail a changé de structure, la collecte
s'arrête avec le message « aucune consultation lue sur la première page : la structure
du portail a peut-être changé ». Il faut alors adapter `src/pmmp/parse.js` à partir
d'une page enregistrée.

### Production (même serveur que l'API ATINA)

```bash
pm2 start npm --name tenders-api -- start
pm2 save
```

Pour que l'app y accède, nginx doit transmettre un nom de domaine en HTTPS vers
`localhost:4100`. Compilez ensuite l'app avec
`--dart-define=API_URL=https://<ce domaine>`. Si vous préférez un cron à la collecte
intégrée, laissez `COLLECT_AT` vide et planifiez
`cd /chemin/tenders_api && npm run collect`.

## API

| Route | Réponse |
|---|---|
| `GET /api/tenders` | `{ total, items: [avis] }`. Paramètres : `status` (`open` par défaut, ou `all`), `q` (mots-clés, accents ignorés), `category` (`travaux`, `services`, `fournitures`), `region`, `sort` (`recent`, `deadline`, `amount`), `limit` (1 à 500, 100 par défaut), `offset` |
| `GET /api/tenders/:id` | un avis (`id` = `orgAcronyme:refConsultation`, à encoder dans l'URL) |
| `GET /api/meta` | compteurs, régions, dernière collecte, `push` (notifications configurées) |
| `POST /api/devices` | inscrit ou met à jour un téléphone : `{ token, platform (android, ios), lang (fr, ar), prefs, saved }`, réponse 204 |
| `DELETE /api/devices` | désinscrit un téléphone : `{ token }`, réponse 204 |
| `GET /health` | `{ ok: true }` |

Un avis contient : `id`, `reference`, `title`, `buyer`, `procedure`, `category`,
`publishedAt`, `deadline` (ISO 8601 avec le décalage de Casablanca), `place`, `city`,
`region`, `estimate`, `deposit`, `siteVisit`, `lotsCount`, `qualifications`,
`dceSizeKb`, `portalUrl` (fiche officielle) et `detailsAvailable`. Les champs lus sur
la fiche valent `null` tant qu'elle n'a pas été lue.

## Tests

Aucun test ne contacte le vrai portail. `test/fixtures/` contient de **vraies pages**
du portail : une page de liste, trois fiches et le formulaire de recherche. Ce sont des
pages publiques, capturées par le projet open source
[pmmp-veille](https://github.com/abderrahmaneelassil-source/pmmp-veille). Leur code
n'est pas repris. Les tests vérifient trois choses :

- **la lecture des pages** : chaque champ de la liste et des fiches, les montants, les
  dates à l'heure de Casablanca (ramadan compris) et les lieux rattachés à leur région ;
- **la collecte complète** contre un faux portail en mémoire : pagination PRADO,
  formulaire, arrêt sur les avis clôturés, second passage sans relecture, refus 403,
  coupe-circuit, `robots.txt`, limite de pages, structure inconnue, une seule collecte à
  la fois, plage horaire et pause entre requêtes ;
- **l'API** : filtres, tri, pagination, paramètres invalides ;
- **les notifications** : validation des inscriptions, correspondance avec les alertes,
  signature du jeton Google (JWT RS256), format des messages FCM v1, regroupement,
  absence de doublons, rappels, jetons périmés, pannes et accès refusé.

`node scripts/contract.js` produit la réponse de l'API à partir de ces pages.
L'app la relit dans ses tests (`mobile/tenders_app/test/fixtures/api_tenders.json`),
ce qui garantit que le serveur et l'app parlent le même format.

## Limites connues

- **Collecte jamais lancée sur le portail réel.** Elle a été développée dans un
  environnement sans accès au portail : elle a été validée sur de vraies pages
  enregistrées, pas en direct. La première collecte en production fera foi.
- **Secteur public uniquement.** Le portail ne publie que les marchés publics. Les
  consultations privées demandent d'autres sources.
- **Avis allotis** : le montant et la caution sont donnés par lot sur une page
  séparée. Pour ces avis, l'API ne donne que le nombre de lots.
- **Notifications jamais envoyées pour de vrai** : l'envoi a été testé contre un faux
  service Google. La première tournée avec un vrai projet Firebase fera foi.
- **Dossiers de consultation (DCE)** : ils ne sont pas téléchargés. L'app renvoie vers
  la fiche officielle, où le portail les remet après un formulaire.
