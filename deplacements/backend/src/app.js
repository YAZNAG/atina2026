const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { Prisma } = require('@prisma/client');
const config = require('./config');
const { authentifier } = require('./middlewares/auth');
const { gestionErreurs } = require('./middlewares/erreurs');
const { tousLesParametres } = require('./lib/parametres');
const { asyncHandler, ok } = require('./lib/http');
const { dossierParametres } = require('./modules/administration/routes');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Les montants Decimal sont renvoyés en nombres JSON.
app.set('json replacer', function remplacer(cle, valeur) {
  const brut = this[cle];
  return Prisma.Decimal.isDecimal(brut) ? brut.toNumber() : valeur;
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors({ origin: config.appUrl, credentials: false }));
app.use(express.json({ limit: '1mb' }));
if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

// ── Routes publiques ──
app.get('/api/sante', (req, res) => ok(res, { statut: 'ok', heure: new Date().toISOString() }));

app.get(
  '/api/public/identite',
  asyncHandler(async (req, res) => {
    const p = await tousLesParametres();
    ok(res, { organisme: p.organisme?.nom, devise: p.devise, logoPersonnalise: Boolean(p.logo) });
  })
);

/** Logo / en-tête : image téléversée par l'administrateur, sinon celle livrée. */
app.get(
  '/api/public/:type(logo|entete)',
  asyncHandler(async (req, res) => {
    const p = await tousLesParametres();
    const perso = p[req.params.type] && path.join(dossierParametres, path.basename(p[req.params.type]));
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(perso && fs.existsSync(perso) ? perso : path.join(config.assetsDir, `${req.params.type}.png`));
  })
);

app.use('/api/auth', require('./modules/auth/routes'));

// ── Routes authentifiées : chaque routeur déclare les permissions de ses écrans ──
app.use('/api', authentifier);
app.use('/api/utilisateurs', require('./modules/utilisateurs/routes'));
app.use('/api/referentiels', require('./modules/referentiels/routes'));
app.use('/api/circuits', require('./modules/circuits/routes'));
app.use('/api/missions', require('./modules/missions/routes'));
app.use('/api/notes-frais', require('./modules/notesFrais/routes'));
app.use('/api/documents', require('./modules/documents/routes'));
app.use('/api/avances', require('./modules/avances/routes'));
app.use('/api/budgets', require('./modules/budgets/routes'));
app.use('/api/vehicules', require('./modules/vehicules/routes'));
app.use('/api/reporting', require('./modules/reporting/routes'));
app.use('/api/notifications', require('./modules/notifications/routes'));
app.use('/api/admin', require('./modules/administration/routes'));

app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Route inconnue' }));

// En production, l'API sert aussi le front compilé.
const front = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(front)) {
  app.use(express.static(front, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(front, 'index.html')));
}

app.use(gestionErreurs);

module.exports = app;
