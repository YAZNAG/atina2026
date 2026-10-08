# ATINA 2 — Plateforme Quick Commerce

**Stack :** Node.js + Express + Prisma/PostgreSQL · React (Vite) · Flutter · React Native (Expo)
**Production :** [atina2.atina.ma](https://atina2.atina.ma) — API `pm2 atina2-api` (port 5002)
**Branche :** `main` (unique branche du dépôt)
**Dernière mise à jour :** 25/09/2026

---

## 1. Contenu du dépôt

```
ATINA-2/
├── backend/              # Node.js + Express + Prisma
│   ├── prisma/           # Schéma PostgreSQL + migrations
│   ├── scripts/          # Seeds de démonstration, outils de maintenance
│   ├── src/
│   │   ├── modules/      # Un dossier par domaine métier
│   │   ├── routes/       # index.js — routeur central
│   │   ├── socket/       # Socket.IO (picker, chat)
│   │   └── server.js
│   └── .env.example
├── frontend/             # React + Vite — back-office
│   └── src/
│       ├── pages/        # Une page par module
│       ├── components/
│       └── routes/
├── mobile/
│   └── customer_app/     # Flutter — application client
│       ├── lib/
│       │   ├── core/     # configuration, client HTTP, jeton, préférences
│       │   ├── i18n/     # traduction FR/AR et RTL
│       │   ├── screens/  # écrans, organisés comme les routes
│       │   ├── services/ # appels d'API
│       │   ├── state/    # états partagés (Riverpod)
│       │   ├── theme/    # charte Figma et composants
│       │   └── widgets/
│       └── test/         # 97 tests : chaque écran en FR et en AR
├── mobile_rn/
│   └── agent_app/        # React Native + Expo — application agent
├── deplacements/         # Gestion des déplacements — Chambre d'Artisanat Souss Massa (voir deplacements/README.md)
├── docs/                 # crédits des photos du catalogue
└── README.md
```

---

## 2. État des modules

| Module | Backend | Back-office | Mobile client | État |
|---|---|---|---|---|
| Auth & RBAC | ✅ | ✅ | ✅ | Complet |
| Catalogue (familles, catégories, articles, SKUs, images) | ✅ | ✅ | ✅ | Complet |
| Geo / Nodes / Créneaux | ✅ | ✅ | Indirect | Complet |
| Clients & Adresses | ✅ | ✅ | ✅ | Complet |
| Checkout | ✅ | ✅ | ✅ | Complet |
| Commandes / OMS | ✅ | ✅ | ✅ | Complet |
| Entrepôt (zones, niveaux, emplacements) | ✅ | ✅ | — | Complet |
| Stock (niveaux, mouvements, lots, seuils) | ✅ | ✅ | — | Complet |
| Picking (sessions, scan EAN) | ✅ | ✅ | — | Complet côté serveur |
| Pickup (COD, confirmation, annulation) | ✅ | ✅ | ✅ | Complet |
| Livraison / Tournées | ✅ | ✅ | — | Complet côté serveur |
| Staff (préparateurs, livreurs) | ✅ | ✅ | — | Complet |
| Paiements / Stripe | ✅ | Partiel | ✅ | Avancé |
| Wallet, Fidélité, Parrainage | ✅ | Partiel | ✅ | Avancé |
| Promotions & Coupons | ✅ | ✅ | ✅ | Complet |
| FAQ & Chat support | ✅ | ✅ | ✅ | Complet |
| Avis produits | ✅ | ✅ | ✅ | Complet |
| Substitution produit | ✅ | ✅ | ✅ | Complet |
| Jeux & lots | ✅ | ✅ | ✅ | Complet |
| Reporting / Tableau de bord | ✅ | Partiel | — | Partiel |

---

## 3. Applications mobiles

| Application | Emplacement | Technologie | État |
|---|---|---|---|
| Client | `mobile/customer_app` | Flutter 3.38 | **Complet** — 46 écrans |
| Agent | `mobile_rn/agent_app` | React Native + Expo | En service |

Les applications **préparateur** et **livreur** n'existent pas dans ce dépôt : leurs
fonctions sont assurées par le back-office (`/api/picker/*` et `/api/driver/*` sont
déjà exposées côté serveur).

### Application client (Flutter)

Portée depuis la version Expo en septembre 2026, à iso-design avec les maquettes
Figma « app client » : rouge `#E10600`, police Inter, cartes arrondies.

- **Paquet Android :** `ma.atina.client` · version 1.0.0
- **Bilingue** français / arabe (670 libellés), bascule RTL sans redémarrage
- **Tests :** `flutter test` monte les 46 écrans dans les deux langues (97 tests)

```bash
cd mobile/customer_app
flutter pub get
flutter test                 # 97 tests : écrans, charte, mesures
flutter run                  # backend de production
flutter build apk --release  # APK à distribuer
```

Backend local : `flutter run --dart-define=API_URL=http://192.168.1.10:5002/api`

> L'APK Flutter n'est pas signé avec le keystore EAS de l'ancienne application Expo :
> il faut désinstaller celle-ci avant d'installer, ou signer avec le même keystore.

---

## 4. Conventions API

| Élément | Valeur |
|---|---|
| Préfixe global | `/api` |
| Auth back-office | `Authorization: Bearer <token>` |
| Auth client | JWT sur `/api/customer/*` |
| Auth préparateur | JWT sur `/api/picker/*` |
| Auth livreur | JWT sur `/api/driver/*` |
| Point de distribution | En-tête `X-Node-Id` (catalogue, prix, stock) |
| Langue | En-tête `X-Lang` (`fr` ou `ar`) |
| Réponse standard | `{ success, message, data }`, paginée si besoin |
| Uploads | `multipart/form-data` |
| Temps réel | Socket.IO (picking, chat support) |

---

## 5. APIs par module

### Auth & Utilisateurs
`/api/auth` · `/api/users` · `/api/roles` · `/api/permissions`

### Catalogue
`/api/catalog/families` · `/api/catalog/categories` · `/api/catalog/sub-categories`
`/api/catalog/brands` · `/api/catalog/articles` · `/api/catalog/skus`
`/api/catalog/units` · `/api/catalog/taxes` · `/api/catalog/packaging-types`

### Géographie & Points de distribution
`/api/regions` · `/api/provinces` · `/api/cities`
`/api/node-types` · `/api/nodes` · `/api/slots`

### Clients
`/api/customers` · `/api/addresses`

### Application client
`/api/customer/auth` · `/api/customer/catalog` · `/api/customer/cart`
`/api/customer/checkout` · `/api/customer/me` · `/api/customer/me/orders`
`/api/customer/me/addresses` · `/api/customer/me/favorites` · `/api/customer/me/notifications`
`/api/customer/promotions` · `/api/customer/pack` · `/api/customer/coupons`
`/api/customer/loyalty` · `/api/customer/wallet` · `/api/customer/points-exchange`
`/api/customer/games` · `/api/customer/support` · `/api/customer/faq`
`/api/customer/claims` · `/api/customer/reviews` · `/api/customer/substitutions`

### Checkout back-office
`/api/checkout/meta` · `/api/checkout/eligible-nodes` · `/api/checkout/delivery-slots`
`/api/checkout/calculate` · `/api/checkout/create-order`

### Commandes / OMS
`/api/orders/statuses` · `/api/orders/delivery-slots`
`/api/orders-mgmt` · `/api/orders-mgmt/:id/transitions` · `/api/orders-mgmt/:id/history`
`/api/orders-mgmt/:id/assign-picker` · `/api/orders-mgmt/:id/confirm-pickup`

### Entrepôt
`/api/warehouse/zones` · `/api/warehouse/levels`
`/api/warehouse/locations` · `/api/warehouse/sku-locations`

### Stock
`/api/stock/levels` · `/api/stock/moves` · `/api/stock/lots`
`/api/stock/selling-rules` · `/api/stock/reorder-rules` · `/api/stock/thresholds`

### Picking
`/api/picking/sessions` · `/api/picking/items`
`/api/picker/login` · `/api/picker/available-orders` · `/api/picker/sessions/:id`

### Pickup
`/api/pickup/ready-orders` · `/api/pickup/orders/:id/collect-cod`
`/api/pickup/orders/:id/confirm` · `/api/pickup/orders/:id/cancel`

### Livraison
`/api/delivery/tours` · `/api/delivery/stops`
`/api/driver/login` · `/api/driver/tours` · `/api/driver/stops/:id`

### Staff
`/api/staff/pickers` · `/api/staff/drivers`

### Paiement & Wallet
`/api/payment/methods` · `/api/payment/statuses`
`/api/payment/stripe/create-intent` · `/api/payment/stripe/webhook` · `/api/payment/stripe/refund`
`/api/wallet/transactions` · `/api/wallet/credit` · `/api/wallet/debit`

### Promotions & Coupons
`/api/promotions` · `/api/coupons` · `/api/coupons/apply` · `/api/coupons/validate`

### FAQ & Support
`/api/faq/categories` · `/api/faq/questions` · `/api/support/tickets` · `/api/support/chat`

### Avis
`/api/reviews` · `/api/reviews/by-article/:articleId`
`/api/reviews/:id/approve` · `/api/reviews/:id/reject`

### Substitution produit
`/api/picking/items/:itemId/substitute`
`/api/substitutions` · `/api/substitutions/suggestions/:skuId`

### Fidélité & Reporting
`/api/loyalty/referrals` · `/api/loyalty/my-referrals`
`/api/reporting/dashboard` · `/api/reporting/orders` · `/api/reporting/picking`
`/api/reporting/delivery` · `/api/reporting/stock` · `/api/reporting/payments`

---

## 6. Lancer en local

```bash
# Backend — http://localhost:5002
cd backend && cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev

# Back-office — http://localhost:5173
cd frontend && npm install && npm run dev

# Application client
cd mobile/customer_app && flutter pub get && flutter run
```

---

## 7. Travaux restants

| Priorité | Travail |
|---|---|
| P0 | Tests transactionnels PostgreSQL (checkout, stock) |
| P1 | Stripe : webhook de production et remboursements complets |
| P1 | Wallet : ledger complet et réconciliation |
| P1 | Notifications push client et staff |
| P2 | Photos manquantes : 78 des 158 produits vendables n'en ont pas |
| P2 | Remplacer les contacts support de test dans le back-office |
| P2 | Reporting avancé et exports |
| P2 | Applications préparateur et livreur, si le terrain les demande |
