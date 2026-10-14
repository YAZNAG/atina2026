import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isAllowed, parseRobots } from '../src/pmmp/robots.js';

const SEARCH = '/index.php?page=entreprise.EntrepriseAdvancedSearch&AllCons';

test('aucun robots.txt : tout est permis', () => {
  assert.equal(isAllowed(parseRobots('', 'Safa9atBot'), SEARCH), true);
});

test('Disallow général', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /', 'Safa9atBot');
  assert.equal(isAllowed(rules, SEARCH), false);
});

test('Disallow vide : tout est permis', () => {
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:', 'Safa9atBot'), SEARCH), true);
});

test('la règle la plus précise gagne, motifs et ancres', () => {
  const rules = parseRobots(
    ['User-agent: *', 'Disallow: /index.php', 'Allow: /index.php?page=entreprise.*Search', 'Disallow: /*.pdf$'].join('\n'),
    'Safa9atBot',
  );
  assert.equal(isAllowed(rules, SEARCH), true);
  assert.equal(isAllowed(rules, '/index.php?page=entreprise.EntrepriseDetailConsultation'), false);
  assert.equal(isAllowed(rules, '/doc.pdf'), false);
  assert.equal(isAllowed(rules, '/doc.pdf?x=1'), true);
});

test('un groupe qui nous nomme remplace le groupe « * »', () => {
  const txt = 'User-agent: *\nDisallow: /\n\nUser-agent: Safa9atBot\nDisallow: /admin';
  const rules = parseRobots(txt, 'Safa9atBot/1.0');
  assert.equal(isAllowed(rules, SEARCH), true);
  assert.equal(isAllowed(rules, '/admin/x'), false);
});
