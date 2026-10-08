# Guide utilisateur — Gestion des déplacements

Application accessible depuis un ordinateur ou un smartphone, à l'adresse communiquée par
l'administrateur. Sur mobile, le menu s'ouvre avec le bouton ☰ en haut à gauche.

## Se connecter

1. Saisissez votre adresse e-mail professionnelle et votre mot de passe.
2. À la première connexion, choisissez un nouveau mot de passe (10 caractères minimum, avec une
   majuscule, une minuscule et un chiffre).
3. Après 5 erreurs de mot de passe, le compte est bloqué 15 minutes. En cas d'oubli, demandez une
   réinitialisation à l'administrateur.

La cloche en haut à droite affiche vos notifications non lues ; elles vous sont aussi envoyées par e-mail.

## Agent : de la demande au remboursement

### 1. Demander une mission

*Missions → Nouvelle mission*

- Renseignez l'objet, la destination, les dates et heures de départ et de retour, le moyen de transport.
- Ajoutez les **personnes concernées** (vous y figurez par défaut) et, à plusieurs, désignez le chef de mission.
- Indiquez les repas fournis par l'organisateur et si l'hébergement est déjà pris en charge.
- Le panneau **Estimation** calcule en direct les indemnités de chaque participant selon le barème.
- Un encadré rouge signale un **conflit de calendrier** (personne ou véhicule déjà en mission) : la
  soumission sera refusée tant qu'il persiste.
- *Enregistrer le brouillon* garde la demande sans l'envoyer ; *Enregistrer et soumettre* l'envoie au
  circuit de validation. Un numéro (ex. OM-2026-0012) est alors attribué.

Suivez l'avancement dans la fiche de la mission, encadré **Circuit de validation**. En cas de refus, le
motif s'affiche : cliquez sur **Réviser**, corrigez, puis soumettez à nouveau.

### 2. Avant le départ

- **Ordre de mission** : bouton en haut de la fiche, une fois la mission approuvée (PDF à l'en-tête de la Chambre).
- **Réservations** (onglet) : enregistrez billets et nuitées, avec la facture ou le billet en pièce jointe.
  Indiquez s'ils sont payés par la Chambre ou par vous.
- **Avance** : *Avances → Demander une avance*. Le service financier la verse ; elle sera déduite
  automatiquement de votre note de frais.
- **Échanges** (onglet) : messages avec les validateurs et participants, conservés dans l'historique.

La mission passe automatiquement « en cours » à la date de départ.

### 3. Au retour : la note de frais

Depuis la fiche de la mission : **Saisir mes frais** (ou *Notes de frais → Nouvelle note de frais*).

1. **Ajoutez chaque dépense** : date, catégorie, montant, description et **justificatif** (PDF ou photo ;
   sur smartphone, *Photographier le ticket* ouvre l'appareil photo).
2. Les montants dépassant un plafond sont automatiquement ramenés au plafond (mention « plafonné »).
3. Le **récapitulatif** affiche : dépenses retenues + indemnités journalières − avance = net à rembourser.
4. Cliquez sur **Soumettre**. Une dépense sans justificatif bloque l'envoi : la ligne concernée est signalée.

Clôturez ensuite la mission (bouton **Clôturer**). Des rappels vous sont envoyés si la note n'est pas
saisie ou si des justificatifs manquent quelques jours après le retour.

## Validateur (chef de service, directeur)

- *À valider* (le compteur du menu indique le nombre de demandes) : missions et notes de frais qui
  attendent **votre** décision à l'étape en cours.
- **Approuver** (commentaire facultatif) fait passer la demande à l'étape suivante ; **Refuser** exige un
  motif, transmis au demandeur.
- Ouvrez la fiche pour voir le détail, l'estimation, les conflits et l'historique avant de décider.
- Vous ne validez jamais vos propres demandes : elles passent automatiquement au niveau supérieur.
- Une relance est envoyée si une demande attend depuis plus de 2 jours.
- *Missions* et *Calendrier* montrent les déplacements de vos services ; *Reporting* et *Budgets* en donnent la synthèse.

## Service financier

### Contrôler et rembourser une note de frais

1. Ouvrez la note depuis *À valider* ou *Notes de frais*.
2. Contrôlez chaque justificatif : **Conforme** ou **Non conforme** (motif obligatoire ; la dépense
   n'est alors plus remboursée). *Tout marquer conforme* accélère le contrôle.
3. **Valider** la note (étape du service financier), puis **Rembourser** : mode de paiement, référence,
   date. Les avances versées sont régularisées automatiquement ; un solde négatif correspond à un
   trop-perçu à reverser.

### Avances

*Avances* : **Verser** une demande (montant ajustable, mode, référence) ou l'**annuler**. Les avances
versées non régularisées apparaissent sur le tableau de bord.

### Budgets

*Budgets* : créez un budget par année (global, par service ou par projet), avec un seuil d'alerte.
La jauge montre la consommation ; une alerte est envoyée au seuil puis au dépassement. Cliquez sur un
budget pour voir les missions imputées (coût estimé, réel, retenu).

### Exports

*Reporting* : export **Excel** (missions, coûts par service, agent, destination, budgets) et **PDF**
(rapport annuel), et **export comptable** des notes remboursées sur une période (Excel ou CSV).

### Parc automobile

*Parc automobile* : fiches véhicules, échéances d'assurance et de visite technique, disponibilités sur
une période. Dans la fiche : carnet de bord, pleins de carburant, entretiens, missions et coût au
kilomètre. Les conducteurs saisissent le carnet de bord des missions qui leur sont affectées.

## Administrateur

| Menu | Usage |
|---|---|
| **Utilisateurs** | Créer les comptes (un mot de passe provisoire est envoyé par e-mail et affiché une fois), rôle, service, fonction, catégorie (détermine le barème), CIN et RIB (chiffrés). Désactiver un compte coupe l'accès immédiatement. *Périmètre global* : pour le directeur. |
| **Référentiels et barèmes** | Services (avec leur responsable, qui valide), catégories d'agents, fonctions, zones, destinations, **barèmes** (taux journalier, taux repas, plafond de nuitée par zone et catégorie, avec dates de validité : créez un nouveau barème plutôt que de modifier l'ancien pour garder l'historique), **plafonds** de frais, projets. |
| **Circuits de validation** | Étapes des missions et des notes de frais : responsable du service, utilisateur désigné ou rôle, avec seuil de montant éventuel. Un circuit peut être propre à un service. |
| **Paramètres** | Organisme, devise (MAD), TVA, exercice, durée de conservation des pièces, règles d'indemnités (heures limites), rappels, blocage des dépassements de budget, comptes comptables, **logo** et **en-tête des documents**, textes et signataires de l'ordre de mission et de l'état des frais. |
| **Journaux et sauvegardes** | Journal d'audit (toutes les actions, avec les valeurs avant / après), connexions, e-mails envoyés, sauvegardes (lancer, télécharger), exécution manuelle des tâches automatiques. |

## Rôles et droits

| | Agent | Validateur | Service financier | Administrateur |
|---|:-:|:-:|:-:|:-:|
| Demander une mission, saisir ses frais, demander une avance | ✓ | ✓ | ✓ | ✓ |
| Valider les demandes de son périmètre / de son étape | | ✓ | ✓ | ✓ |
| Voir missions, budgets et reporting de son périmètre | | ✓ | ✓ | ✓ |
| Contrôler, rembourser, verser les avances, gérer budgets et parc, export comptable | | | ✓ | ✓ |
| Utilisateurs, référentiels, circuits, paramètres, journaux, sauvegardes | | | | ✓ |
