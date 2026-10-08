/** Détection des chevauchements de déplacements (agents et véhicules). */

const STATUTS_ACTIFS = ['EN_ATTENTE', 'APPROUVE', 'EN_COURS'];

const chevauche = (a, b) =>
  new Date(a.dateDepart) < new Date(b.dateRetour) && new Date(b.dateDepart) < new Date(a.dateRetour);

/**
 * @param {{id?:number, dateDepart, dateRetour, vehiculeId?:number|null, participantIds:number[]}} mission
 * @param {Array<{id, numero, statut, dateDepart, dateRetour, vehiculeId, participantIds:number[]}>} autres
 */
function detecterConflits(mission, autres) {
  const conflits = [];
  for (const m of autres) {
    if (m.id === mission.id || !STATUTS_ACTIFS.includes(m.statut) || !chevauche(mission, m)) continue;
    for (const uid of mission.participantIds) {
      if (m.participantIds.includes(uid)) {
        conflits.push({ type: 'PARTICIPANT', userId: uid, missionId: m.id, numero: m.numero });
      }
    }
    if (mission.vehiculeId && m.vehiculeId === mission.vehiculeId) {
      conflits.push({ type: 'VEHICULE', vehiculeId: m.vehiculeId, missionId: m.id, numero: m.numero });
    }
  }
  return conflits;
}

module.exports = { STATUTS_ACTIFS, chevauche, detecterConflits };
