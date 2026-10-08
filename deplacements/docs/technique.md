# Documentation technique

## 1. Architecture

```
Navigateur (React, responsive) ──HTTPS──▶ Reverse proxy ──▶ API Express (port 5010)
                                                              │
                                     ┌────────────────────────┼─────────────────────────┐
                                     ▼                        ▼                         ▼
                              PostgreSQL (Prisma)   storage/justificatifs        SMTP (e-mails)
                                                    (fichiers chiffrés AES-GCM)
```

Le backend est découpé en trois couches :

| Couche | Dossier | Rôle |
|---|---|---|
| Domaine | `src/domain/` | Règles métier **pures** (sans base ni HTTP) : calcul des indemnités, des notes de frais, circuits de validation, situation budgétaire, conflits de calendrier, matrice des droits. C'est la partie couverte par les tests unitaires. |
| Modules | `src/modules/<domaine>/` | `routes.js` (validation zod, permission, réponse HTTP) et `service.js` (chargement des données, transactions, notifications, audit). |
| Bibliothèques | `src/lib/` | Services techniques transverses : PDF, Excel, chiffrement, stockage des pièces, e-mails, journal d'audit, numérotation, paramètres, sauvegarde. |

L'interface est une application monopage : `src/App.jsx` déclare les routes, chaque écran est
chargé à la demande (`lazy`). En production, l'API sert aussi `frontend/dist`.

### Évolutivité

- **Application mobile** : toute la logique est exposée par l'API REST (JSON, JWT) ; une application
  mobile peut la consommer telle quelle. Les justificatifs se téléversent déjà depuis l'appareil photo.
- **Intégration paie** : l'export comptable (`/api/reporting/export-comptable`) et les montants
  `montantARembourser` des notes remboursées sont les points d'accroche ; un module `paie` peut
  s'ajouter dans `src/modules/` sans toucher aux autres.
- **Signature électronique** : les PDF sont générés à la volée (`lib/pdf.js`) ; les visas sont déjà
  tracés (table `Validation`). Un module de signature peut s'insérer après l'approbation finale
  (`apresApprobation` dans `modules/missions/service.js`).
- **Nouveau module** : créer `src/modules/x/routes.js`, l'enregistrer dans `src/app.js`, ajouter les
  permissions dans `src/domain/permissions.js`, puis la page dans `frontend/src/pages` et l'entrée de menu
  dans `components/Layout.jsx`.

## 2. Modèle de données

Schéma complet : `backend/prisma/schema.prisma`. Montants en `Decimal(12,2)` (dirhams), renvoyés en
nombres JSON.

| Domaine | Tables |
|---|---|
| Référentiels | `Service` (hiérarchie, responsable), `CategorieAgent`, `Fonction`, `Zone`, `Destination`, `Bareme` (zone × catégorie, période de validité), `PlafondFrais`, `Projet` |
| Utilisateurs | `User` (rôle, périmètre global, CIN et RIB chiffrés, verrouillage), `ConnexionLog` |
| Circuits | `CircuitValidation`, `EtapeCircuit`, `Validation` (décisions) |
| Missions | `Mission`, `MissionParticipant`, `Reservation` (billets, nuitées), `MessageMission` |
| Frais | `NoteFrais`, `LigneFrais`, `Avance` |
| Budget | `Budget` (global, service ou projet, par année) |
| Parc | `Vehicule`, `CarnetBord`, `PleinCarburant`, `Entretien` |
| Transverse | `Document` (pièces chiffrées), `Notification`, `EmailLog`, `AuditLog`, `Parametre`, `ModeleDocument`, `Compteur`, `Sauvegarde` |

Statuts :

- Mission : `BROUILLON → EN_ATTENTE → APPROUVE → EN_COURS → CLOTURE`, avec `REFUSE` (retour possible en
  brouillon) et `ANNULE`. Table des transitions : `TRANSITIONS_MISSION` dans `domain/workflow.js`.
- Note de frais : `BROUILLON → SOUMISE → VALIDEE → REMBOURSEE`, avec `REJETEE` (retour en brouillon).
- Avance : `DEMANDEE → VERSEE → REGULARISEE`, ou `ANNULEE`.

Numérotation automatique et atomique (`lib/numerotation.js`) : `OM-2026-0001` (ordre de mission,
attribué à la première soumission), `NF-2026-0001` (note de frais), `AV-2026-0001` (avance).

## 3. Règles de calcul

### Indemnités journalières (`domain/indemnites.js`)

Barème retenu : celui de la **zone de la destination** et de la **catégorie de l'agent**, en vigueur à
la date de départ (le plus récent si plusieurs périodes se chevauchent).

Nombre de jours indemnisables (seuils paramétrables dans *Paramètres → Règles d'indemnités*) :

| Situation | Décompte |
|---|---|
| Mission dans la journée | 1 jour si la durée atteint 6 h, sinon ½ |
| Jour de départ | 1 si départ avant 12 h, sinon ½ |
| Jour de retour | 1 si retour à partir de 14 h, sinon ½ |
| Jours intermédiaires | 1 chacun |

`indemnités = jours × taux journalier − repas fournis × taux repas` (jamais négatif).

Coût estimé d'une mission = Σ participants (indemnités + nuits × plafond nuitée) + transport estimé +
autres frais.

### Note de frais (`domain/notesFrais.js`)

- Chaque dépense est retenue dans la limite du plafond de sa catégorie (plafond propre à la catégorie
  d'agent s'il existe, sinon plafond général) : **par dépense** ou **cumulé par jour**.
- L'hébergement est plafonné à `plafond nuitée du barème × nuits à la charge de l'agent` ; les nuits
  réservées et payées par la Chambre, ou toutes si « hébergement pris en charge », sont exclues.
- Une dépense jugée non conforme au contrôle n'est pas retenue.
- `net à rembourser = dépenses retenues + indemnités − avances versées`. Un montant négatif est un
  trop-perçu que l'agent doit reverser.
- La soumission exige un justificatif pour chaque dépense dont le plafond l'impose (toutes par défaut).

### Circuits de validation (`domain/workflow.js`)

Un circuit est choisi par type (mission ou note de frais) : celui du service du demandeur, sinon d'un
service parent, sinon le circuit par défaut. Chaque étape désigne ses validateurs :

| Type d'étape | Validateurs |
|---|---|
| Responsable du service | Responsable du service du demandeur ; s'il n'y en a pas (ou si c'est le demandeur), on remonte la hiérarchie, puis on se rabat sur un validateur à périmètre global. |
| Utilisateur désigné | L'utilisateur indiqué (ex. le Directeur). |
| Rôle | Tous les utilisateurs actifs de ce rôle (ex. service financier). |

- **Pas d'auto-validation** : le demandeur n'est jamais validateur de sa propre demande.
- Une étape sans validateur éligible est **sautée** et tracée (`decision = SAUTE`).
- Une étape peut ne s'appliquer qu'au-delà d'un **seuil de montant**.
- Refus : motif obligatoire, la demande revient au demandeur qui peut la réviser et la resoumettre.

### Budget (`domain/budget.js`)

Imputation par défaut : budget du projet, sinon du service, sinon budget global de l'année.

| Indicateur | Définition |
|---|---|
| Prévisionnel | Coût estimé des missions en attente de validation |
| Engagé | Part non encore dépensée des missions approuvées, en cours ou clôturées non soldées |
| Réalisé | Notes remboursées + réservations payées par la Chambre + carburant imputé à la mission |
| Consommé | Réalisé pour les missions soldées, sinon max(estimé, réalisé) |
| Disponible | Montant (ajusté sinon initial) − consommé |

Une alerte est notifiée au service financier quand le seuil (80 % par défaut) puis 100 % sont atteints.
L'option *Bloquer les dépassements* refuse l'approbation finale d'une mission qui dépasse le disponible.

### Export comptable

Pour chaque note remboursée sur la période : débit des comptes de charges par catégorie et des
indemnités, crédit du compte d'avances (3431) pour l'avance régularisée et du compte de tiers
paramétré pour le net. Les comptes se règlent dans *Paramètres → Comptabilité*. Formats : Excel ou CSV
(séparateur `;`, UTF-8 avec BOM, compatible Excel).

## 4. Sécurité

| Exigence | Mise en œuvre |
|---|---|
| Authentification | E-mail + mot de passe (bcrypt, coût 12), jeton JWT (8 h par défaut). Politique : 10 caractères, majuscule, minuscule, chiffre. Mot de passe provisoire à changer à la première connexion. |
| Force brute | Limitation à 20 tentatives / 15 min par IP ; verrouillage du compte 15 min après 5 échecs. |
| Journal des connexions | Table `ConnexionLog` : succès, échecs et motif, IP, navigateur. |
| Contrôle d'accès | Chaque route déclare sa permission (`autoriser(...)`, matrice `domain/permissions.js`) ; en plus, contrôle de périmètre sur les objets : un agent ne voit que ses missions, un chef de service celles de ses services, un brouillon reste privé. Les validateurs sont vérifiés à chaque décision. L'interface masque les actions non permises mais l'API est la référence. |
| Compte désactivé | Le jeton est revérifié à chaque requête : la désactivation coupe l'accès immédiatement. |
| Chiffrement en transit | HTTPS assuré par le reverse proxy ; en-têtes de sécurité `helmet`. |
| Chiffrement au repos | AES-256-GCM (`lib/crypto.js`) pour le CIN, le RIB et **toutes les pièces justificatives** sur disque. La consultation en clair du CIN/RIB par l'administrateur est tracée. |
| Fichiers téléversés | Type déterminé par la signature binaire (PDF, JPEG, PNG, WEBP, HEIC), taille limitée (10 Mo), noms aléatoires, chemin confiné au dossier de stockage. |
| Historisation | `AuditLog` : chaque création, modification (différences champ par champ), décision, export et édition de PDF, avec utilisateur, date et IP. Aucune route ne permet de modifier ou supprimer le journal. |
| Conservation | Chaque pièce porte une date `conserverJusqua` (10 ans par défaut, paramétrable). Une pièce rattachée à une note soumise ne peut plus être supprimée ; une mission soumise ne se supprime pas (elle s'annule). |
| Sauvegardes | `pg_dump` + archive des pièces (déjà chiffrées), chaque nuit, 30 conservées, téléchargeables par l'administrateur. |

## 5. API

Préfixe `/api`. Réponse : `{ success, message, data }` ; listes paginées : `data` + `meta { total, page, limit, pages }`
(paramètres `page`, `limit`). Erreurs : `{ success: false, message, details? }` avec 400 (validation),
401, 403, 404, 409 (conflit d'état, de calendrier ou de budget).

| Ressource | Routes principales |
|---|---|
| Authentification | `POST /auth/login`, `GET /auth/moi`, `POST /auth/mot-de-passe`, `POST /auth/deconnexion` |
| Utilisateurs | `GET /utilisateurs/annuaire` · admin : `GET/POST /utilisateurs`, `GET/PUT /utilisateurs/:id`, `POST /utilisateurs/:id/reinitialiser-mot-de-passe` |
| Référentiels | `GET/POST/PUT/DELETE /referentiels/{services,categories-agents,fonctions,zones,destinations,baremes,plafonds,projets}` |
| Circuits | `GET/POST/PUT/DELETE /circuits` |
| Missions | `GET/POST /missions`, `GET/PUT/DELETE /missions/:id`, `POST /missions/estimation`, `GET /missions/a-valider`, `GET /missions/calendrier`, `POST /missions/:id/{soumettre,decision,demarrer,cloturer,annuler,reviser}`, `GET /missions/:id/{pdf,historique}`, `GET/POST /missions/:id/messages`, `POST/PUT/DELETE /missions/:id/reservations[/:rid]` |
| Notes de frais | `GET/POST /notes-frais`, `GET /notes-frais/:id`, `GET /notes-frais/a-valider`, `POST/PUT/DELETE /notes-frais/:id/lignes[/:ligneId]`, `POST /notes-frais/:id/{soumettre,decision,rembourser,reviser}`, `POST /notes-frais/:id/lignes/:ligneId/controle`, `GET /notes-frais/:id/{pdf,historique}` |
| Pièces | `POST /documents` (multipart `fichier`), `GET /documents/:id`, `DELETE /documents/:id` |
| Avances | `GET/POST /avances`, `POST /avances/:id/{verser,annuler}` |
| Budgets | `GET/POST /budgets`, `GET/PUT/DELETE /budgets/:id` |
| Parc | `GET/POST/PUT/DELETE /vehicules`, `GET /vehicules/disponibles`, `GET/POST /vehicules/:id/{carnet,pleins,entretiens}`, `GET /vehicules/:id/statistiques` |
| Reporting | `GET /reporting/tableau-de-bord`, `GET /reporting/export.xlsx`, `GET /reporting/export.pdf`, `GET /reporting/export-comptable?du=&au=&format=csv` |
| Notifications | `GET /notifications`, `POST /notifications/:id/lue`, `POST /notifications/tout-lire` |
| Administration | `GET/PUT /admin/parametres`, `POST/DELETE /admin/parametres/{logo,entete}`, `GET/PUT /admin/modeles/:code`, `GET /admin/{audit,connexions,emails}`, `GET/POST /admin/sauvegardes`, `GET /admin/sauvegardes/:id/{base,justificatifs}`, `POST /admin/taches/:nom` |
| Public | `GET /sante`, `GET /public/identite`, `GET /public/{logo,entete}` |

## 6. Notifications et tâches planifiées

Chaque événement crée une notification dans l'application et envoie un e-mail (`lib/notifier.js`) :
validation attendue, approbation, refus, rejet, remboursement, avance versée, message sur une mission,
alerte budgétaire. L'envoi d'e-mail ne bloque jamais la requête ; échecs et envois sont journalisés.

Tâches (`src/jobs/taches.js`, exécutables aussi depuis *Administration → Journaux → Tâches*) :

| Tâche | Fréquence | Effet |
|---|---|---|
| `demarrer-missions` | 15 min | Missions approuvées dont le départ est atteint → « en cours » |
| `rappels-cloture` | 8 h, jours ouvrés | Rappel au demandeur des missions terminées non clôturées |
| `rappels-justificatifs` | 8 h, jours ouvrés | Note non saisie, non soumise, rejetée, ou justificatifs manquants |
| `relances-validateurs` | 8 h, jours ouvrés | Demandes en attente depuis plus de N jours (2 par défaut) |
| `echeances-parc` | 8 h, jours ouvrés | Assurance ou visite technique à moins de 30 jours |
| `sauvegarde` | 2 h 30 | Base + pièces, rotation des 30 dernières |

## 7. Documents PDF

`lib/pdf.js` (pdfkit) produit des A4 avec l'en-tête officiel (`assets/entete.png`, remplaçable dans
*Paramètres*), un titre, des sections, des tableaux paginés et un pied de page numéroté. Les textes
(titre, introduction, pied de page, signataires) de l'ordre de mission et de l'état des frais se
modifient dans *Paramètres → Modèles de documents*. Un ordre de mission non approuvé porte la mention
« PROJET ».

## 8. Tests

| Fichier | Contenu |
|---|---|
| `tests/unit/indemnites.test.js` | Jours et demi-journées, nuitées, déduction des repas, choix du barème par date, estimation |
| `tests/unit/notesFrais.test.js` | Plafonds par dépense et cumulés par jour, plafond par catégorie d'agent, hébergement, non-conformité, avance, trop-perçu, arrondis |
| `tests/unit/workflow.test.js` | Transitions, résolution des validateurs, remontée hiérarchique, absence d'auto-validation, étapes sautées, seuils |
| `tests/unit/conflitsBudget.test.js` | Chevauchements, situation budgétaire, matrice des droits |
| `tests/api/auth.test.js` | Connexion, verrouillage, jeton, compte désactivé, politique de mot de passe, contrôle d'accès par rôle, données sensibles |
| `tests/api/circuit.test.js` | Parcours complet mission → note de frais → remboursement : circuits, refus, révision, auto-approbation du directeur, conflits, avance, chiffrement des pièces, plafonds, contrôle, export comptable équilibré, budget, tâches, confidentialité des brouillons |

```bash
cd backend && npm test
```
