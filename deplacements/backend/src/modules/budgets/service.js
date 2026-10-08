const prisma = require('../../lib/prisma');
const { situationBudget } = require('../../domain/budget');
const { num, round2 } = require('../../domain/montants');
const { perimetreServices } = require('../../lib/contexte');

const SELECT_COUT = {
  id: true,
  numero: true,
  objet: true,
  statut: true,
  coutEstime: true,
  budgetId: true,
  serviceId: true,
  dateDepart: true,
  participants: { select: { userId: true } },
  notesFrais: { select: { statut: true, totalRetenu: true, totalIndemnites: true } },
  reservations: { select: { montant: true, payePar: true } },
  pleins: { select: { montant: true } },
};

/** Coût réel et état de solde d'une mission (chargée avec SELECT_COUT). */
function coutMission(m) {
  const notes = m.notesFrais.filter((n) => n.statut === 'REMBOURSEE');
  const coutReel = round2(
    notes.reduce((a, n) => a + num(n.totalRetenu) + num(n.totalIndemnites), 0) +
      m.reservations.filter((r) => r.payePar === 'CHAMBRE').reduce((a, r) => a + num(r.montant), 0) +
      m.pleins.reduce((a, p) => a + num(p.montant), 0)
  );
  const soldee =
    m.statut === 'CLOTURE' &&
    m.notesFrais.length >= m.participants.length &&
    m.notesFrais.every((n) => n.statut === 'REMBOURSEE');
  const coutRetenu = soldee ? coutReel : Math.max(num(m.coutEstime), coutReel);
  return { statut: m.statut, coutEstime: num(m.coutEstime), coutReel, soldee, coutRetenu: round2(coutRetenu) };
}

async function situationBudgetParId(budgetId, { exclureMissionId } = {}) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  const missions = await prisma.mission.findMany({
    where: { budgetId, ...(exclureMissionId && { id: { not: exclureMissionId } }) },
    select: SELECT_COUT,
  });
  return situationBudget(budget, missions.map(coutMission));
}

async function budgetsAvecSituation(where = {}) {
  const budgets = await prisma.budget.findMany({
    where,
    include: { service: { select: { id: true, nom: true } }, projet: { select: { id: true, code: true, libelle: true } } },
    orderBy: [{ annee: 'desc' }, { type: 'asc' }, { libelle: 'asc' }],
  });
  const missions = await prisma.mission.findMany({ where: { budgetId: { in: budgets.map((b) => b.id) } }, select: SELECT_COUT });
  return budgets.map((b) => ({
    ...b,
    situation: situationBudget(b, missions.filter((m) => m.budgetId === b.id).map(coutMission)),
  }));
}

/** Périmètre budgétaire : tout pour la finance, sinon budget global + services dirigés. */
async function filtreBudgets(user) {
  if (user.permissions.includes('budget:gerer') || user.perimetreGlobal) return {};
  const services = await perimetreServices(user.id);
  return { OR: [{ type: 'GLOBAL' }, { serviceId: { in: services } }] };
}

module.exports = { filtreBudgets, SELECT_COUT, coutMission, situationBudgetParId, budgetsAvecSituation };
