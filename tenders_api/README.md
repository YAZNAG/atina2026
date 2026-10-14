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

## Résumés IA

Chaque avis peut recevoir un **résumé rédigé par Claude** (modèle `claude-opus-5-5` par
défaut), en français et en arabe, en un seul appel : une phrase d'accroche, 3 à 5
points utiles pour décider (prestation, budget, caution, délai, visite, lots), les
points de vigilance (délai court, caution élevée, qualification exigée…) et le profil
d'entreprise visé.

- **Réponse garantie** : la sortie est contrainte par un schéma JSON (structured
  outputs). Le serveur borne encore la longueur de chaque champ.
- **Fidèle à l'avis** : le résumé ne s'appuie que sur les champs collectés (objet,
  acheteur, lieu, dates, estimation, caution, visite, lots, qualifications). Il ne lit
  pas le cahier des charges (CPS), qui n'est pas téléchargé. Le texte de l'avis est
  traité comme une donnée, jamais comme une consigne.
- **Une seule rédaction par avis** : le résumé est gardé en base et refait seulement si
  l'avis change (rectificatif, report). Deux ouvertures simultanées de la même fiche ne
  coûtent qu'un appel.
- **Préparé d'avance** : après chaque collecte, les nouveaux avis sont résumés (au
  plus `AI_PRECOMPUTE_PER_RUN`). Les autres le sont à la première ouverture de leur
  fiche, en quelques secondes.
- **Coût maîtrisé** : au plus `AI_DAILY_LIMIT` résumés par jour. Effort de réflexion
  « faible » par défaut (`AI_EFFORT`), suffisant pour cette tâche. Les consignes
  communes (≈ 1 300 jetons, avec un exemple) sont mises en cache (prompt caching) : au
  sein d'une même salve, leur relecture coûte un dixième du prix.
- **Refus** : si un filtre de sécurité refuse un avis, l'API le relance d'elle-même
  sur un autre modèle (`fallbacks: "default"`). Un refus définitif est mémorisé et
  l'app garde son résumé automatique.

Ordre de grandeur, au tarif de Claude Opus 5.5 (4 $ par million de jetons lus,
20 $ par million écrits, 0,20 $ en lecture de cache) : un résumé lit environ
1 300 jetons de consignes (en cache) et 400 jetons d'avis, puis écrit 600 à 1 000
jetons (réflexion comprise). Cela fait **environ 0,01 à 0,03 $ par avis**. Avec une
centaine de nouveaux avis par jour, comptez quelques dollars par jour. Le journal du
serveur affiche les jetons de chaque résumé pour suivre le coût réel. Pour réduire la
facture, `AI_MODEL=claude-sonnet-5-5` ou `claude-haiku-5-5` coûte nettement moins cher,
pour une qualité à vérifier sur quelques avis.

```bash
npm run summarize   # résume maintenant les avis ouverts qui n'ont pas de résumé
```

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

## Bons de commande

Le portail publie aussi les **bons de commande** (« avis d'achat » : petits achats sur
simple devis) dans un module séparé, `/bdc/entreprise/consultation/`. Le collecteur les
lit après les appels d'offres, avec les mêmes règles de politesse :

1. Il parcourt les pages `?page=1, 2, 3…` jusqu'à une page vide ou répétée, ou jusqu'au
   nombre de résultats annoncé (au plus `BDC_MAX_PAGES`).
2. Chaque avis est repéré par le lien vers sa fiche (`/show/<id>`). Ses champs sont lus
   d'après leurs intitulés : référence, objet, acheteur public, date limite de remise
   des devis, lieu d'exécution, et la mention « Annulé ».
3. Il lit ensuite la fiche des bons de commande nouveaux ou modifiés : catégorie, date
   de publication, montant estimatif s'il est publié (au plus `BDC_DETAILS_PER_RUN`).

Dans l'API, chaque avis porte `kind` (`ao` pour un appel d'offres, `bdc` pour un bon de
commande) et `cancelled`. Les avis annulés ne sont jamais renvoyés comme ouverts, et
`GET /api/tenders?kind=bdc` ne renvoie que les bons de commande. Une panne de ce module
ne fait pas échouer la collecte des appels d'offres : elle est marquée « partielle ».

> **À valider sur de vraies pages.** La mise en page de ce module n'a pas pu être
> relevée depuis l'environnement de développement (portail bloqué). Les pages de test
> `test/fixtures/bdc_*.html` sont **synthétiques**. La lecture a été écrite pour ne
> dépendre que des liens et des intitulés, et vérifiée sur deux mises en page
> différentes (cartes et tableau). Elle reste à confirmer sur le vrai portail : il
> faut enregistrer une page de liste et une fiche, et les ajouter aux tests. Si rien
> n'est lu, la collecte le signale (« aucun bon de commande lu sur la première page »)
> au lieu d'enregistrer des données fausses.

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
| `BDC_ENABLED` / `BDC_MAX_PAGES` / `BDC_DETAILS_PER_RUN` | bons de commande : actifs, pages et fiches au plus par collecte | `true` / `200` / `200` |
| `FCM_SERVICE_ACCOUNT` | fichier JSON du compte de service Firebase, vide = pas de notifications | — |
| `NOTIFY_AT` | heure de la tournée de notifications (Casablanca) | `08:30` |
| `ANTHROPIC_API_KEY` | clé d'API Anthropic, vide = pas de résumés IA | — |
| `AI_MODEL` / `AI_EFFORT` | modèle Claude et effort de réflexion | `claude-opus-5-5` / `low` |
| `AI_DAILY_LIMIT` / `AI_PRECOMPUTE_PER_RUN` | résumés par jour au plus / préparés après chaque collecte | `300` / `100` |

## Lancer

```bash
npm start                    # API + collecte (COLLECT_AT) + notifications (NOTIFY_AT)
npm run collect              # une collecte maintenant (refusée hors plage horaire)
npm run collect -- --force   # essai réduit en journée : 1 page, 10 fiches
npm run notify               # tournée de notifications maintenant
npm run summarize            # résumés IA des avis qui n'en ont pas
npm test                     # 74 tests, sans requête vers le portail, Google ni Anthropic
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
| `GET /api/tenders` | `{ total, items: [avis] }`. Paramètres : `status` (`open` par défaut, ou `all`), `kind` (`ao` ou `bdc`), `q` (mots-clés, accents ignorés), `category` (`travaux`, `services`, `fournitures`), `region`, `sort` (`recent`, `deadline`, `amount`), `limit` (1 à 500, 100 par défaut), `offset` |
| `GET /api/tenders/:id` | un avis (`id` = `orgAcronyme:refConsultation`, à encoder dans l'URL), avec `aiSummary` s'il est déjà rédigé |
| `GET /api/tenders/:id/summary` | résumé IA `{ fr, ar }` (chacun : `headline`, `points`, `attention`, `forWhom`), rédigé à la première demande. 503 sans clé d'API, 422 si refusé, 429 si le plafond du jour est atteint |
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
- **Résumés IA jamais générés pour de vrai** : testés avec un faux client Anthropic
  (aucun coût engagé). Vérifiez les premiers résumés réels et le champ
  `cache_read_input_tokens` dans le journal.
- **Notifications jamais envoyées pour de vrai** : l'envoi a été testé contre un faux
  service Google. La première tournée avec un vrai projet Firebase fera foi.
- **Dossiers de consultation (DCE)** : ils ne sont pas téléchargés. L'app renvoie vers
  la fiche officielle, où le portail les remet après un formulaire.
