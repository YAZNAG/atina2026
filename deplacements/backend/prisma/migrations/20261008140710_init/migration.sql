-- CreateEnum
CREATE TYPE "Role" AS ENUM ('AGENT', 'VALIDATEUR', 'FINANCIER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CategorieFrais" AS ENUM ('TRANSPORT', 'HEBERGEMENT', 'REPAS', 'CARBURANT', 'PEAGE_PARKING', 'TAXI', 'DIVERS');

-- CreateEnum
CREATE TYPE "UnitePlafond" AS ENUM ('PAR_DEPENSE', 'PAR_JOUR');

-- CreateEnum
CREATE TYPE "TypeObjet" AS ENUM ('MISSION', 'NOTE_FRAIS');

-- CreateEnum
CREATE TYPE "TypeEtape" AS ENUM ('RESPONSABLE_SERVICE', 'UTILISATEUR', 'ROLE');

-- CreateEnum
CREATE TYPE "Decision" AS ENUM ('APPROUVE', 'REFUSE', 'SAUTE');

-- CreateEnum
CREATE TYPE "StatutMission" AS ENUM ('BROUILLON', 'EN_ATTENTE', 'APPROUVE', 'REFUSE', 'EN_COURS', 'CLOTURE', 'ANNULE');

-- CreateEnum
CREATE TYPE "MoyenTransport" AS ENUM ('VOITURE_SERVICE', 'VOITURE_PERSONNELLE', 'TRAIN', 'AVION', 'AUTOCAR', 'TAXI', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeReservation" AS ENUM ('BILLET_TRAIN', 'BILLET_AVION', 'BILLET_AUTOCAR', 'LOCATION_VOITURE', 'HEBERGEMENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "PayePar" AS ENUM ('CHAMBRE', 'AGENT');

-- CreateEnum
CREATE TYPE "StatutNoteFrais" AS ENUM ('BROUILLON', 'SOUMISE', 'VALIDEE', 'REJETEE', 'REMBOURSEE');

-- CreateEnum
CREATE TYPE "StatutControle" AS ENUM ('EN_ATTENTE', 'CONFORME', 'NON_CONFORME');

-- CreateEnum
CREATE TYPE "StatutAvance" AS ENUM ('DEMANDEE', 'VERSEE', 'REGULARISEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "TypeBudget" AS ENUM ('GLOBAL', 'SERVICE', 'PROJET');

-- CreateEnum
CREATE TYPE "StatutVehicule" AS ENUM ('DISPONIBLE', 'EN_MISSION', 'EN_ENTRETIEN', 'HORS_SERVICE');

-- CreateTable
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "parentId" INTEGER,
    "responsableId" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorieAgent" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategorieAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fonction" (
    "id" SERIAL NOT NULL,
    "libelle" TEXT NOT NULL,
    "categorieId" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Fonction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "international" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" SERIAL NOT NULL,
    "ville" TEXT NOT NULL,
    "pays" TEXT NOT NULL DEFAULT 'Maroc',
    "zoneId" INTEGER NOT NULL,
    "distanceKm" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bareme" (
    "id" SERIAL NOT NULL,
    "zoneId" INTEGER NOT NULL,
    "categorieId" INTEGER NOT NULL,
    "tauxJournalier" DECIMAL(12,2) NOT NULL,
    "tauxRepas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "plafondNuitee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tauxKilometrique" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bareme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlafondFrais" (
    "id" SERIAL NOT NULL,
    "categorieFrais" "CategorieFrais" NOT NULL,
    "categorieAgentId" INTEGER,
    "montant" DECIMAL(12,2) NOT NULL,
    "unite" "UnitePlafond" NOT NULL DEFAULT 'PAR_DEPENSE',
    "justificatifObligatoire" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlafondFrais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Projet" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Projet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "matricule" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "perimetreGlobal" BOOLEAN NOT NULL DEFAULT false,
    "telephone" TEXT,
    "cinChiffre" TEXT,
    "ribChiffre" TEXT,
    "serviceId" INTEGER,
    "fonctionId" INTEGER,
    "categorieId" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "tentativesEchouees" INTEGER NOT NULL DEFAULT 0,
    "verrouilleJusqua" TIMESTAMP(3),
    "derniereConnexion" TIMESTAMP(3),
    "doitChangerMdp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnexionLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "email" TEXT NOT NULL,
    "succes" BOOLEAN NOT NULL,
    "motif" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnexionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircuitValidation" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeObjet" NOT NULL,
    "serviceId" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CircuitValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtapeCircuit" (
    "id" SERIAL NOT NULL,
    "circuitId" INTEGER NOT NULL,
    "ordre" INTEGER NOT NULL,
    "libelle" TEXT NOT NULL,
    "typeEtape" "TypeEtape" NOT NULL,
    "role" "Role",
    "utilisateurId" INTEGER,
    "seuilMontant" DECIMAL(12,2),

    CONSTRAINT "EtapeCircuit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Validation" (
    "id" SERIAL NOT NULL,
    "objetType" "TypeObjet" NOT NULL,
    "missionId" INTEGER,
    "noteFraisId" INTEGER,
    "etapeOrdre" INTEGER NOT NULL,
    "etapeLibelle" TEXT NOT NULL,
    "validateurId" INTEGER,
    "decision" "Decision" NOT NULL,
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Validation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" SERIAL NOT NULL,
    "numero" TEXT,
    "objet" TEXT NOT NULL,
    "description" TEXT,
    "destinationId" INTEGER NOT NULL,
    "lieuPrecis" TEXT,
    "dateDepart" TIMESTAMP(3) NOT NULL,
    "dateRetour" TIMESTAMP(3) NOT NULL,
    "moyenTransport" "MoyenTransport" NOT NULL,
    "vehiculeId" INTEGER,
    "demandeurId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "projetId" INTEGER,
    "budgetId" INTEGER,
    "circuitId" INTEGER,
    "etapeCourante" INTEGER,
    "statut" "StatutMission" NOT NULL DEFAULT 'BROUILLON',
    "nbRepasFournis" INTEGER NOT NULL DEFAULT 0,
    "hebergementPrisEnCharge" BOOLEAN NOT NULL DEFAULT false,
    "fraisTransportEstimes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "autresFraisEstimes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "coutEstime" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "motifRefus" TEXT,
    "soumisLe" TIMESTAMP(3),
    "approuveLe" TIMESTAMP(3),
    "clotureLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionParticipant" (
    "id" SERIAL NOT NULL,
    "missionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "chefMission" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MissionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" SERIAL NOT NULL,
    "missionId" INTEGER NOT NULL,
    "type" "TypeReservation" NOT NULL,
    "prestataire" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "nbNuits" INTEGER NOT NULL DEFAULT 0,
    "montant" DECIMAL(12,2) NOT NULL,
    "payePar" "PayePar" NOT NULL DEFAULT 'CHAMBRE',
    "beneficiaireId" INTEGER,
    "documentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageMission" (
    "id" SERIAL NOT NULL,
    "missionId" INTEGER NOT NULL,
    "auteurId" INTEGER NOT NULL,
    "contenu" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteFrais" (
    "id" SERIAL NOT NULL,
    "numero" TEXT,
    "missionId" INTEGER NOT NULL,
    "agentId" INTEGER NOT NULL,
    "statut" "StatutNoteFrais" NOT NULL DEFAULT 'BROUILLON',
    "circuitId" INTEGER,
    "etapeCourante" INTEGER,
    "joursIndemnises" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "tauxJournalier" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalIndemnites" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDepenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalRetenu" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "avanceDeduite" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantARembourser" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "motifRejet" TEXT,
    "soumiseLe" TIMESTAMP(3),
    "valideeLe" TIMESTAMP(3),
    "rembourseeLe" TIMESTAMP(3),
    "referencePaiement" TEXT,
    "modePaiement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteFrais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneFrais" (
    "id" SERIAL NOT NULL,
    "noteFraisId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "categorie" "CategorieFrais" NOT NULL,
    "description" TEXT,
    "montant" DECIMAL(12,2) NOT NULL,
    "montantRetenu" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "depassementPlafond" BOOLEAN NOT NULL DEFAULT false,
    "statutControle" "StatutControle" NOT NULL DEFAULT 'EN_ATTENTE',
    "commentaireControle" TEXT,
    "documentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LigneFrais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avance" (
    "id" SERIAL NOT NULL,
    "numero" TEXT,
    "missionId" INTEGER NOT NULL,
    "agentId" INTEGER NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "statut" "StatutAvance" NOT NULL DEFAULT 'DEMANDEE',
    "modeVersement" TEXT,
    "referenceVersement" TEXT,
    "verseeLe" TIMESTAMP(3),
    "noteFraisId" INTEGER,
    "soldeRegularisation" DECIMAL(12,2),
    "regulariseeLe" TIMESTAMP(3),
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Avance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" SERIAL NOT NULL,
    "annee" INTEGER NOT NULL,
    "libelle" TEXT NOT NULL,
    "type" "TypeBudget" NOT NULL,
    "serviceId" INTEGER,
    "projetId" INTEGER,
    "montantInitial" DECIMAL(14,2) NOT NULL,
    "montantAjuste" DECIMAL(14,2),
    "seuilAlerte" INTEGER NOT NULL DEFAULT 80,
    "alerteEnvoyee" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicule" (
    "id" SERIAL NOT NULL,
    "immatriculation" TEXT NOT NULL,
    "marque" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "carburant" TEXT NOT NULL DEFAULT 'Diesel',
    "nbPlaces" INTEGER NOT NULL DEFAULT 5,
    "kilometrage" INTEGER NOT NULL DEFAULT 0,
    "statut" "StatutVehicule" NOT NULL DEFAULT 'DISPONIBLE',
    "dateAssurance" DATE,
    "dateVisiteTechnique" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarnetBord" (
    "id" SERIAL NOT NULL,
    "vehiculeId" INTEGER NOT NULL,
    "missionId" INTEGER,
    "conducteurId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "kmDepart" INTEGER NOT NULL,
    "kmArrivee" INTEGER NOT NULL,
    "trajet" TEXT NOT NULL,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarnetBord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PleinCarburant" (
    "id" SERIAL NOT NULL,
    "vehiculeId" INTEGER NOT NULL,
    "missionId" INTEGER,
    "date" DATE NOT NULL,
    "litres" DECIMAL(8,2) NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "kilometrage" INTEGER,
    "station" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PleinCarburant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entretien" (
    "id" SERIAL NOT NULL,
    "vehiculeId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "montant" DECIMAL(12,2) NOT NULL,
    "kilometrage" INTEGER,
    "garage" TEXT,
    "prochainEntretienKm" INTEGER,
    "prochainEntretienDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entretien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "nomOriginal" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "cheminStockage" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "chiffre" BOOLEAN NOT NULL DEFAULT true,
    "categorie" TEXT NOT NULL DEFAULT 'JUSTIFICATIF',
    "uploadedById" INTEGER NOT NULL,
    "missionId" INTEGER,
    "noteFraisId" INTEGER,
    "conserverJusqua" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "lien" TEXT,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" SERIAL NOT NULL,
    "destinataire" TEXT NOT NULL,
    "sujet" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "erreur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" INTEGER,
    "avant" JSONB,
    "apres" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parametre" (
    "cle" TEXT NOT NULL,
    "valeur" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parametre_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "ModeleDocument" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "texteIntro" TEXT,
    "textePied" TEXT,
    "signataires" JSONB NOT NULL DEFAULT '[]',
    "afficherEntete" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compteur" (
    "cle" TEXT NOT NULL,
    "valeur" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Compteur_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "Sauvegarde" (
    "id" SERIAL NOT NULL,
    "fichier" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "statut" TEXT NOT NULL,
    "erreur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sauvegarde_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_code_key" ON "Service"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CategorieAgent_code_key" ON "CategorieAgent"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Fonction_libelle_key" ON "Fonction"("libelle");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_code_key" ON "Zone"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_ville_pays_key" ON "Destination"("ville", "pays");

-- CreateIndex
CREATE INDEX "Bareme_zoneId_categorieId_idx" ON "Bareme"("zoneId", "categorieId");

-- CreateIndex
CREATE UNIQUE INDEX "PlafondFrais_categorieFrais_categorieAgentId_key" ON "PlafondFrais"("categorieFrais", "categorieAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "Projet_code_key" ON "Projet"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_matricule_key" ON "User"("matricule");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ConnexionLog_createdAt_idx" ON "ConnexionLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EtapeCircuit_circuitId_ordre_key" ON "EtapeCircuit"("circuitId", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "Mission_numero_key" ON "Mission"("numero");

-- CreateIndex
CREATE INDEX "Mission_statut_idx" ON "Mission"("statut");

-- CreateIndex
CREATE INDEX "Mission_dateDepart_dateRetour_idx" ON "Mission"("dateDepart", "dateRetour");

-- CreateIndex
CREATE UNIQUE INDEX "MissionParticipant_missionId_userId_key" ON "MissionParticipant"("missionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_documentId_key" ON "Reservation"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteFrais_numero_key" ON "NoteFrais"("numero");

-- CreateIndex
CREATE INDEX "NoteFrais_statut_idx" ON "NoteFrais"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "NoteFrais_missionId_agentId_key" ON "NoteFrais"("missionId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "LigneFrais_documentId_key" ON "LigneFrais"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Avance_numero_key" ON "Avance"("numero");

-- CreateIndex
CREATE INDEX "Budget_annee_idx" ON "Budget"("annee");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicule_immatriculation_key" ON "Vehicule"("immatriculation");

-- CreateIndex
CREATE UNIQUE INDEX "Document_cheminStockage_key" ON "Document"("cheminStockage");

-- CreateIndex
CREATE INDEX "Notification_userId_lu_idx" ON "Notification"("userId", "lu");

-- CreateIndex
CREATE INDEX "AuditLog_entite_entiteId_idx" ON "AuditLog"("entite", "entiteId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModeleDocument_code_key" ON "ModeleDocument"("code");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fonction" ADD CONSTRAINT "Fonction_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "CategorieAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bareme" ADD CONSTRAINT "Bareme_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bareme" ADD CONSTRAINT "Bareme_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "CategorieAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlafondFrais" ADD CONSTRAINT "PlafondFrais_categorieAgentId_fkey" FOREIGN KEY ("categorieAgentId") REFERENCES "CategorieAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_fonctionId_fkey" FOREIGN KEY ("fonctionId") REFERENCES "Fonction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "CategorieAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnexionLog" ADD CONSTRAINT "ConnexionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircuitValidation" ADD CONSTRAINT "CircuitValidation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapeCircuit" ADD CONSTRAINT "EtapeCircuit_circuitId_fkey" FOREIGN KEY ("circuitId") REFERENCES "CircuitValidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapeCircuit" ADD CONSTRAINT "EtapeCircuit_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_noteFraisId_fkey" FOREIGN KEY ("noteFraisId") REFERENCES "NoteFrais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_validateurId_fkey" FOREIGN KEY ("validateurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "Vehicule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES "Projet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_circuitId_fkey" FOREIGN KEY ("circuitId") REFERENCES "CircuitValidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionParticipant" ADD CONSTRAINT "MissionParticipant_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionParticipant" ADD CONSTRAINT "MissionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMission" ADD CONSTRAINT "MessageMission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMission" ADD CONSTRAINT "MessageMission_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteFrais" ADD CONSTRAINT "NoteFrais_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteFrais" ADD CONSTRAINT "NoteFrais_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteFrais" ADD CONSTRAINT "NoteFrais_circuitId_fkey" FOREIGN KEY ("circuitId") REFERENCES "CircuitValidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneFrais" ADD CONSTRAINT "LigneFrais_noteFraisId_fkey" FOREIGN KEY ("noteFraisId") REFERENCES "NoteFrais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneFrais" ADD CONSTRAINT "LigneFrais_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avance" ADD CONSTRAINT "Avance_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avance" ADD CONSTRAINT "Avance_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avance" ADD CONSTRAINT "Avance_noteFraisId_fkey" FOREIGN KEY ("noteFraisId") REFERENCES "NoteFrais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_projetId_fkey" FOREIGN KEY ("projetId") REFERENCES "Projet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarnetBord" ADD CONSTRAINT "CarnetBord_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "Vehicule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarnetBord" ADD CONSTRAINT "CarnetBord_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarnetBord" ADD CONSTRAINT "CarnetBord_conducteurId_fkey" FOREIGN KEY ("conducteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PleinCarburant" ADD CONSTRAINT "PleinCarburant_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "Vehicule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PleinCarburant" ADD CONSTRAINT "PleinCarburant_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entretien" ADD CONSTRAINT "Entretien_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "Vehicule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_noteFraisId_fkey" FOREIGN KEY ("noteFraisId") REFERENCES "NoteFrais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
