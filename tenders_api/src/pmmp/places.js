// Lieux d'exécution du portail (provinces et préfectures, en majuscules sans accents)
// rattachés aux douze régions du découpage de 2015, avec leur nom d'affichage.

const REGIONS = {
  'Tanger-Tétouan-Al Hoceïma': [
    'Tanger-Assilah', 'Tanger', "M'diq-Fnideq", 'Tétouan', 'Fahs-Anjra', 'Larache',
    'Al Hoceïma', 'Chefchaouen', 'Ouezzane',
  ],
  Oriental: [
    'Oujda-Angad', 'Oujda', 'Nador', 'Driouch', 'Jerada', 'Berkane', 'Taourirt', 'Guercif',
    'Figuig',
  ],
  'Fès-Meknès': [
    'Fès', 'Meknès', 'El Hajeb', 'Ifrane', 'Moulay Yacoub', 'Sefrou', 'Boulemane', 'Taounate',
    'Taza',
  ],
  'Rabat-Salé-Kénitra': [
    'Rabat', 'Salé', 'Skhirate-Témara', 'Témara', 'Kénitra', 'Khémisset', 'Sidi Kacem',
    'Sidi Slimane',
  ],
  'Béni Mellal-Khénifra': ['Béni Mellal', 'Azilal', 'Fquih Ben Salah', 'Khénifra', 'Khouribga'],
  'Casablanca-Settat': [
    'Casablanca', 'Mohammédia', 'El Jadida', 'Nouaceur', 'Médiouna', 'Benslimane', 'Berrechid',
    'Settat', 'Sidi Bennour', 'Aïn Chock', 'Aïn Sebaâ-Hay Mohammadi', 'Al Fida-Mers Sultan',
    'Ben Msick', 'Casablanca-Anfa', 'Hay Hassani', 'Moulay Rachid', 'Sidi Bernoussi',
  ],
  'Marrakech-Safi': [
    'Marrakech', 'Chichaoua', 'Al Haouz', 'El Kelâa des Sraghna', 'Kelâa des Sraghna',
    'Essaouira', 'Rehamna', 'Safi', 'Youssoufia',
  ],
  'Drâa-Tafilalet': ['Errachidia', 'Ouarzazate', 'Midelt', 'Tinghir', 'Zagora'],
  'Souss-Massa': [
    'Agadir Ida-Outanane', 'Agadir', 'Inezgane-Aït Melloul', 'Inezgane', 'Chtouka-Aït Baha',
    'Taroudant', 'Tiznit', 'Tata',
  ],
  'Guelmim-Oued Noun': ['Guelmim', 'Assa-Zag', 'Tan-Tan', 'Sidi Ifni'],
  'Laâyoune-Sakia El Hamra': ['Laâyoune', 'Boujdour', 'Tarfaya', 'Es-Semara', 'Smara'],
  'Dakhla-Oued Ed-Dahab': ['Oued Ed-Dahab', 'Dakhla', 'Aousserd'],
};

export const REGION_NAMES = Object.keys(REGIONS);

/** « Fès-Meknès » → « FES MEKNES » : majuscules, sans accents ni ponctuation. */
export function placeKey(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Du plus long au plus court : « TANGER ASSILAH » avant « TANGER ».
const ALIASES = Object.entries(REGIONS)
  .flatMap(([region, places]) =>
    places.flatMap((name) => [
      { key: placeKey(name), name, region },
      { key: placeKey(region), name: region, region },
    ]),
  )
  .sort((a, b) => b.key.length - a.key.length);

/** « SIDI KACEM » → « Sidi Kacem » pour un lieu inconnu de la table. */
function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())
    .trim();
}

/**
 * Lieu d'exécution du portail → { city, region }.
 * Plusieurs lieux (séparés par des virgules) : le premier reconnu donne la ville.
 */
export function resolvePlace(raw) {
  const parts = String(raw ?? '')
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter((p) => p && p !== '-');
  for (const part of parts) {
    const k = ` ${placeKey(part)} `;
    const hit = ALIASES.find((a) => a.key && k.includes(` ${a.key} `));
    if (hit) return { city: hit.name, region: hit.region };
  }
  return { city: parts.length ? titleCase(parts[0]) : '', region: null };
}
