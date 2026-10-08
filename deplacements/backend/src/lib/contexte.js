/** Chargement des données nécessaires aux circuits de validation et aux périmètres. */
const prisma = require('./prisma');
const { resoudreValidateurs } = require('../domain/workflow');

async function chargerReferentielValidation() {
  const [services, utilisateurs] = await Promise.all([
    prisma.service.findMany({ select: { id: true, parentId: true, responsableId: true } }),
    prisma.user.findMany({ where: { actif: true }, select: { id: true, role: true, actif: true, perimetreGlobal: true } }),
  ]);
  return { services: new Map(services.map((s) => [s.id, s])), utilisateurs };
}

/** Contexte de validation pour un demandeur donné. */
const contexte = (ref, demandeur) => ({ ...ref, demandeur: { id: demandeur.id, serviceId: demandeur.serviceId } });

/** Circuit actif applicable : celui du service (ou d'un service parent), sinon le circuit par défaut. */
async function circuitApplicable(type, serviceId) {
  const services = await prisma.service.findMany({ select: { id: true, parentId: true } });
  const parents = new Map(services.map((s) => [s.id, s.parentId]));
  let sid = serviceId;
  const vus = new Set();
  while (sid && !vus.has(sid)) {
    vus.add(sid);
    const c = await prisma.circuitValidation.findFirst({
      where: { type, serviceId: sid, actif: true },
      include: { etapes: { orderBy: { ordre: 'asc' } } },
    });
    if (c) return c;
    sid = parents.get(sid);
  }
  return prisma.circuitValidation.findFirst({
    where: { type, serviceId: null, actif: true },
    include: { etapes: { orderBy: { ordre: 'asc' } } },
  });
}

/** Services dirigés par l'utilisateur et leurs sous-services. */
async function perimetreServices(userId) {
  const services = await prisma.service.findMany({ select: { id: true, parentId: true, responsableId: true } });
  const enfants = new Map();
  for (const s of services) {
    if (!enfants.has(s.parentId)) enfants.set(s.parentId, []);
    enfants.get(s.parentId).push(s.id);
  }
  const res = new Set();
  const pile = services.filter((s) => s.responsableId === userId).map((s) => s.id);
  while (pile.length) {
    const id = pile.pop();
    if (res.has(id)) continue;
    res.add(id);
    pile.push(...(enfants.get(id) || []));
  }
  return [...res];
}

/** Validateurs de l'étape courante d'un objet (mission ou note) dont le circuit est chargé. */
function validateursEtapeCourante(objet, ref, demandeur) {
  if (!objet.circuit || !objet.etapeCourante) return [];
  const etape = objet.circuit.etapes.find((e) => e.ordre === objet.etapeCourante);
  return etape ? resoudreValidateurs(etape, contexte(ref, demandeur)) : [];
}

module.exports = { chargerReferentielValidation, contexte, circuitApplicable, perimetreServices, validateursEtapeCourante };
