const ExcelJS = require('exceljs');

/**
 * Classeur Excel à une ou plusieurs feuilles.
 * @param {Array<{nom:string, colonnes:Array<{header:string,key:string,width?:number,format?:'mad'|'date'|'nombre'}>, lignes:object[]}>} feuilles
 */
async function classeur(feuilles, { titre } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Chambre d'Artisanat Souss Massa";
  wb.created = new Date();
  for (const f of feuilles) {
    const ws = wb.addWorksheet(f.nom.slice(0, 31));
    let debut = 1;
    if (titre) {
      ws.getCell('A1').value = titre;
      ws.getCell('A1').font = { bold: true, size: 13 };
      ws.getCell('A2').value = `Édité le ${new Date().toLocaleString('fr-MA')}`;
      debut = 4;
    }
    ws.columns = f.colonnes.map((c) => ({ key: c.key, width: c.width || 18 }));
    const entete = ws.getRow(debut);
    f.colonnes.forEach((c, i) => {
      const cell = entete.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9A3412' } };
    });
    f.lignes.forEach((l, r) => {
      const row = ws.getRow(debut + 1 + r);
      f.colonnes.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        let v = l[c.key];
        if (c.format === 'date' && v) v = new Date(v);
        if ((c.format === 'mad' || c.format === 'nombre') && v !== null && v !== undefined && v !== '') v = Number(v);
        cell.value = v ?? null;
        if (c.format === 'mad') cell.numFmt = '#,##0.00 "MAD"';
        if (c.format === 'date') cell.numFmt = 'dd/mm/yyyy';
      });
    });
    ws.views = [{ state: 'frozen', ySplit: debut }];
    ws.autoFilter = { from: { row: debut, column: 1 }, to: { row: debut, column: f.colonnes.length } };
  }
  return wb.xlsx.writeBuffer();
}

function envoyerExcel(res, buffer, nom) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.send(Buffer.from(buffer));
}

function envoyerPdf(res, buffer, nom, inline = true) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${nom}"`);
  res.send(buffer);
}

module.exports = { classeur, envoyerExcel, envoyerPdf };
