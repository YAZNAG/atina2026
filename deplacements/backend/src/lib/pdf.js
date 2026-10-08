/** Génération des documents PDF à l'en-tête officiel de la Chambre. */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const config = require('../config');
const { tousLesParametres } = require('./parametres');
const { date: dateFr } = require('./format');

const COULEUR = '#9a3412';
const MARGE = 40;

/** Les polices PDF standard (WinAnsi) ne couvrent pas certains symboles. */
const txt = (v) =>
  String(v ?? '')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/[\u202f\u00a0]/g, ' ');

/** En-tête : image téléversée par l'administrateur, sinon l'en-tête officiel livré. */
async function cheminEntete() {
  const p = await tousLesParametres();
  if (p.entete) {
    const abs = path.resolve(config.uploadDir, '..', 'parametres', path.basename(p.entete));
    if (fs.existsSync(abs)) return abs;
  }
  return path.join(config.assetsDir, 'entete.png');
}

/**
 * Crée un document PDF A4 avec en-tête et pied de page numéroté.
 * @returns {Promise<{doc: PDFKit.PDFDocument, largeur:number, fin: () => Promise<Buffer>}>}
 */
async function creerPdf({ titre, sousTitre, modele, paysage = false }) {
  const params = await tousLesParametres();
  const doc = new PDFDocument({
    size: 'A4',
    layout: paysage ? 'landscape' : 'portrait',
    margins: { top: MARGE, bottom: 60, left: MARGE, right: MARGE },
    bufferPages: true,
    info: { Title: titre, Author: params.organisme?.nom || "Chambre d'Artisanat", Creator: 'Gestion des déplacements' },
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const termine = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const largeur = doc.page.width - MARGE * 2;

  if (!modele || modele.afficherEntete !== false) {
    const entete = await cheminEntete();
    const hauteur = Math.min(95, largeur * (192 / 690));
    doc.image(entete, MARGE + (largeur - hauteur * (690 / 192)) / 2, MARGE - 10, { height: hauteur });
    doc.y = MARGE - 10 + hauteur + 4;
    doc.moveTo(MARGE, doc.y).lineTo(MARGE + largeur, doc.y).lineWidth(1).strokeColor(COULEUR).stroke();
    doc.moveDown(0.8);
  }

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#1c1917').text(txt(titre), { align: 'center' });
  if (sousTitre) doc.font('Helvetica').fontSize(10).fillColor('#57534e').text(txt(sousTitre), { align: 'center' });
  doc.moveDown(0.8);
  if (modele?.texteIntro) {
    doc.font('Helvetica').fontSize(10).fillColor('#292524').text(txt(modele.texteIntro), { align: 'justify' });
    doc.moveDown(0.6);
  }

  const fin = async () => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bas = doc.page.height - 40;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(7.5).fillColor('#78716c');
      doc.text(txt(modele?.textePied || params.organisme?.nom || ''), MARGE, bas - 10, { width: largeur, align: 'center' });
      doc.text(`Page ${i - range.start + 1}/${range.count}`, MARGE, bas + 2, { width: largeur, align: 'center' });
    }
    doc.end();
    return termine;
  };

  return { doc, largeur, fin };
}

/** Titre de section. */
function section(doc, texte) {
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COULEUR).text(txt(texte).toUpperCase(), MARGE, doc.y, { width: doc.page.width - MARGE * 2 });
  doc.moveDown(0.2);
  doc.fillColor('#1c1917');
}

/** Paires libellé / valeur sur deux colonnes. */
function champs(doc, paires, largeur) {
  const colLib = 150;
  doc.fontSize(9.5);
  for (const [lib, val] of paires) {
    const y = doc.y;
    doc.font('Helvetica-Bold').fillColor('#44403c').text(txt(lib), MARGE, y, { width: colLib });
    doc.font('Helvetica').fillColor('#1c1917').text(txt(val ?? '—'), MARGE + colLib, y, { width: largeur - colLib });
    doc.y = Math.max(doc.y, y + 14);
  }
  doc.x = MARGE;
}

/**
 * Tableau simple avec saut de page et ligne d'en-tête répétée.
 * @param {Array<{label:string, width:number, align?:'left'|'right'|'center'}>} colonnes (largeurs relatives)
 * @param {Array<Array<string>>} lignes
 * @param {{total?: Array<string>}} [options]
 */
function tableau(doc, colonnes, lignes, largeur, options = {}) {
  const totalRel = colonnes.reduce((a, c) => a + c.width, 0);
  const cols = colonnes.map((c) => ({ ...c, w: (c.width / totalRel) * largeur }));
  const pad = 4;
  const hauteurLigne = (cells, font) => {
    doc.font(font).fontSize(8.5);
    return Math.max(16, ...cells.map((t, i) => doc.heightOfString(txt(t), { width: cols[i].w - pad * 2 }) + pad * 2));
  };
  const dessiner = (cells, { entete = false, gras = false } = {}) => {
    const font = entete || gras ? 'Helvetica-Bold' : 'Helvetica';
    const h = hauteurLigne(cells, font);
    if (doc.y + h > doc.page.height - 70) {
      doc.addPage();
      if (!entete) dessiner(cols.map((c) => c.label), { entete: true });
    }
    const y = doc.y;
    let x = MARGE;
    if (entete) doc.rect(MARGE, y, largeur, h).fill(COULEUR);
    else if (gras) doc.rect(MARGE, y, largeur, h).fill('#f5f5f4');
    cols.forEach((c, i) => {
      doc
        .font(font)
        .fontSize(8.5)
        .fillColor(entete ? '#ffffff' : '#1c1917')
        .text(txt(cells[i]), x + pad, y + pad, { width: c.w - pad * 2, align: c.align || 'left' });
      x += c.w;
    });
    doc.moveTo(MARGE, y + h).lineTo(MARGE + largeur, y + h).lineWidth(0.4).strokeColor('#d6d3d1').stroke();
    doc.x = MARGE;
    doc.y = y + h;
  };
  dessiner(cols.map((c) => c.label), { entete: true });
  for (const l of lignes) dessiner(l);
  if (options.total) dessiner(options.total, { gras: true });
  doc.moveDown(0.5);
}

/** Bloc de signatures en bas de document. */
function signatures(doc, signataires, largeur, ville) {
  if (!signataires?.length) return;
  if (doc.y > doc.page.height - 150) doc.addPage();
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(9.5).fillColor('#1c1917');
  if (ville) doc.text(txt(`Fait à ${ville}, le ${dateFr(new Date())}`), MARGE, doc.y, { width: largeur, align: 'right' });
  doc.moveDown(0.8);
  const w = largeur / signataires.length;
  const y = doc.y;
  signataires.forEach((s, i) => {
    doc.font('Helvetica-Bold').fontSize(9.5).text(txt(s.libelle), MARGE + i * w, y, { width: w, align: 'center' });
  });
  doc.x = MARGE;
  doc.y = y + 70;
}

module.exports = { creerPdf, section, champs, tableau, signatures, txt, MARGE, COULEUR };
