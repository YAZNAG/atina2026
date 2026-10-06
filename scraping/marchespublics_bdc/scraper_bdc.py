#!/usr/bin/env python3
"""Scraping des bons de commande (BDC) du portail marchespublics.gov.ma.

Le script :
  1. parcourt toutes les pages de https://www.marchespublics.gov.ma/bdc/entreprise/consultation/ ;
  2. extrait, pour chaque consultation, tous les champs affichés (et ceux de la
     page de détail avec --details) ;
  3. ne garde que les consultations dont la « Date et heure limite de remise des
     devis » est postérieure à la date et l'heure de lancement du script ;
  4. regroupe le résultat par « Nature de prestation » ;
  5. écrit un classeur Excel (une feuille de synthèse, une feuille globale et une
     feuille par nature), un CSV et un JSON dans resultats/<horodatage>/.

L'extraction ne dépend pas de classes CSS : elle repère les libellés affichés
(« Référence », « Objet », « Date et heure limite… », etc.), ce qui la rend
tolérante aux changements de mise en page.

Exemples :
    python scraper_bdc.py
    python scraper_bdc.py --details
    python scraper_bdc.py --navigateur          # si la liste est chargée en JavaScript
    python scraper_bdc.py --fichier page.html   # analyse d'une page enregistrée
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import unicodedata
from collections import OrderedDict, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup, NavigableString, Tag

URL_DEFAUT = "https://www.marchespublics.gov.ma/bdc/entreprise/consultation/"
FUSEAU = ZoneInfo("Africa/Casablanca")
NATURE_INCONNUE = "Non précisée"
ENTETES = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9,ar;q=0.6,en;q=0.5",
}

# Libellés reconnus -> nom de colonne. Les clés sont normalisées (minuscules,
# sans accents) et comparées par préfixe, dans l'ordre (le plus précis d'abord).
LIBELLES = [
    ("date et heure limite de remise des devis", "date_limite_remise_devis"),
    ("date et heure limite", "date_limite_remise_devis"),
    ("date limite de remise", "date_limite_remise_devis"),
    ("date limite", "date_limite_remise_devis"),
    ("nature de la prestation", "nature_prestation"),
    ("nature de prestation", "nature_prestation"),
    ("nature des prestations", "nature_prestation"),
    ("nature", "nature_prestation"),
    ("date de publication", "date_publication"),
    ("date de mise en ligne", "date_publication"),
    ("publie le", "date_publication"),
    ("reference", "reference"),
    ("ref", "reference"),
    ("numero", "reference"),
    ("objet", "objet"),
    ("acheteur public", "acheteur"),
    ("acheteur", "acheteur"),
    ("organisme", "acheteur"),
    ("maitre d'ouvrage", "acheteur"),
    ("service", "service"),
    ("lieu d'execution", "lieu_execution"),
    ("lieu de livraison", "lieu_execution"),
    ("lieu", "lieu_execution"),
    ("ville", "lieu_execution"),
    ("region", "region"),
    ("province", "province"),
    ("categorie", "categorie"),
    ("domaine", "domaine"),
    ("type", "type"),
    ("estimation", "estimation"),
    ("montant", "estimation"),
    ("caution", "caution_provisoire"),
    ("statut", "statut"),
    ("etat", "statut"),
    ("adresse de depot", "adresse_depot"),
    ("adresse", "adresse"),
    ("contact", "contact"),
    ("telephone", "telephone"),
    ("tel", "telephone"),
    ("e-mail", "email"),
    ("email", "email"),
    ("courriel", "email"),
    ("delai d'execution", "delai_execution"),
    ("delai", "delai_execution"),
    ("visite des lieux", "visite_des_lieux"),
    ("reserve", "reserve"),
]

RE_DEADLINE = re.compile(r"date\s+(et\s+heure\s+)?limite", re.I)
RE_DATE = re.compile(
    r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})"
    r"(?:[^\d]{0,12}?(\d{1,2})\s*[:hH]\s*(\d{2})?)?"
)
RE_DATE_ISO = re.compile(r"(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?")
RE_PAGINATION_TEXTE = re.compile(r"^(\d+|suivant\w*|next|»|›|>|>>|dernier\w*|last)$", re.I)


# --------------------------------------------------------------------------- #
# Outils texte et dates
# --------------------------------------------------------------------------- #
def normaliser(texte: str) -> str:
    texte = unicodedata.normalize("NFKD", texte)
    texte = "".join(c for c in texte if not unicodedata.combining(c))
    texte = texte.replace("’", "'").lower()
    return re.sub(r"\s+", " ", texte).strip(" :.- ")


def nettoyer(texte: str) -> str:
    return re.sub(r"\s+", " ", texte.replace(" ", " ")).strip(" :\t\n")


def libelle_connu(texte: str) -> str | None:
    """Renvoie la colonne si `texte` est (ou commence par) un libellé connu."""
    n = normaliser(texte)
    if not n or len(n) > 70:
        return None
    for cle, colonne in LIBELLES:
        if n == cle or n.startswith(cle + " ") or n.startswith(cle + "("):
            return colonne
    return None


def colonne_generique(libelle: str) -> str:
    n = re.sub(r"[^a-z0-9]+", "_", normaliser(libelle)).strip("_")
    return n[:60] or "champ"


def parser_date(texte: str | None) -> datetime | None:
    """« 15/10/2026 à 10:00 », « 15-10-2026 10h00 », « 2026-10-15T10:00 »…"""
    if not texte:
        return None
    m = RE_DATE.search(texte)
    if m:
        j, mo, a, h, mi = m.groups()
        a = int(a) + (2000 if len(a) == 2 else 0)
        heure, minute = (int(h), int(mi or 0)) if h else (23, 59)
    else:
        m = RE_DATE_ISO.search(texte)
        if not m:
            return None
        a, mo, j, h, mi = m.groups()
        a = int(a)
        heure, minute = (int(h), int(mi)) if h else (23, 59)
    try:
        return datetime(a, int(mo), int(j), heure, minute, tzinfo=FUSEAU)
    except ValueError:
        return None


def temps_restant(limite: datetime, reference: datetime) -> str:
    delta: timedelta = limite - reference
    jours, reste = divmod(int(delta.total_seconds()), 86400)
    heures, reste = divmod(reste, 3600)
    return f"{jours} j {heures} h {reste // 60} min"


# --------------------------------------------------------------------------- #
# Extraction des champs
# --------------------------------------------------------------------------- #
def lignes_texte(element: Tag) -> list[str]:
    lignes = []
    for brut in element.get_text("\n").split("\n"):
        ligne = nettoyer(brut)
        if ligne:
            lignes.append(ligne)
    return lignes


def ajouter(champs: OrderedDict, colonne: str, valeur: str) -> None:
    valeur = nettoyer(valeur)
    if not valeur:
        return
    if colonne in champs and champs[colonne] != valeur:
        if valeur not in champs[colonne].split(" | "):
            champs[colonne] = f"{champs[colonne]} | {valeur}"
    else:
        champs[colonne] = valeur


def extraire_paires(element: Tag) -> OrderedDict:
    """Extrait toutes les paires libellé / valeur visibles dans `element`."""
    champs: OrderedDict = OrderedDict()

    # 1) Listes de définitions et tableaux à deux colonnes.
    for dt in element.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            lib = nettoyer(dt.get_text(" "))
            ajouter(champs, libelle_connu(lib) or colonne_generique(lib), dd.get_text(" "))
    for tr in element.find_all("tr"):
        cellules = tr.find_all(["th", "td"], recursive=False)
        if len(cellules) == 2:
            lib = nettoyer(cellules[0].get_text(" "))
            if lib and len(lib) <= 70:
                ajouter(champs, libelle_connu(lib) or colonne_generique(lib),
                        cellules[1].get_text(" "))

    # 2) Texte libre : « Libellé : valeur » ou libellé puis valeur à la ligne.
    lignes = lignes_texte(element)
    i = 0
    while i < len(lignes):
        ligne = lignes[i]
        if ":" in ligne:
            gauche, droite = ligne.split(":", 1)
            colonne = libelle_connu(gauche)
            if colonne is None and 2 <= len(gauche) <= 50 and not re.search(r"\d{1,2}$", gauche):
                colonne = colonne_generique(gauche) if droite.strip() else None
            if colonne:
                valeur = droite.strip()
                if not valeur and i + 1 < len(lignes) and libelle_connu(lignes[i + 1].split(":")[0]) is None:
                    valeur = lignes[i + 1]
                    i += 1
                ajouter(champs, colonne, valeur)
                i += 1
                continue
        colonne = libelle_connu(ligne)
        if colonne and i + 1 < len(lignes) and libelle_connu(lignes[i + 1]) is None:
            ajouter(champs, colonne, lignes[i + 1])
            i += 2
            continue
        i += 1
    return champs


def liens(element: Tag, base: str) -> tuple[str, list[str]]:
    detail, documents = "", []
    for a in element.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "javascript", "mailto:", "tel:")):
            continue
        url = urljoin(base, href)
        texte = normaliser(a.get_text(" "))
        if re.search(r"\.(pdf|zip|rar|docx?|xlsx?)(\?|$)|telecharg|download|document", url.lower() + " " + texte):
            documents.append(url)
        elif not detail:
            detail = url
    return detail, sorted(set(documents))


def blocs_consultation(soup: BeautifulSoup) -> list[Tag]:
    """Un bloc = plus petit ancêtre contenant un seul libellé « Date limite »."""
    ancres = [
        t.parent for t in soup.find_all(string=RE_DEADLINE)
        if isinstance(t, NavigableString) and t.parent and t.parent.name not in ("script", "style", "option", "label", "th")
    ]
    blocs: list[Tag] = []
    for ancre in ancres:
        bloc = ancre
        while bloc.parent is not None and bloc.parent.name not in ("body", "html", "[document]"):
            if len(bloc.parent.find_all(string=RE_DEADLINE)) > 1:
                break
            bloc = bloc.parent
        if bloc.name in ("body", "html"):
            continue
        if not any(bloc is b or bloc in b.parents for b in blocs):
            blocs = [b for b in blocs if b not in bloc.parents]
            blocs.append(bloc)
    # On écarte les blocs qui ne sont que le libellé (ex. filtre de recherche).
    return [b for b in blocs if len(lignes_texte(b)) >= 3]


def lignes_tableau(soup: BeautifulSoup) -> list[tuple[OrderedDict, Tag]]:
    """Mode tableau : en-têtes dans <th>, une consultation par <tr>."""
    resultats = []
    for table in soup.find_all("table"):
        entetes_tr = table.find("thead") or table.find("tr")
        if not entetes_tr:
            continue
        entetes = [nettoyer(th.get_text(" ")) for th in entetes_tr.find_all(["th", "td"])]
        if not any(RE_DEADLINE.search(e) for e in entetes):
            continue
        corps = table.find("tbody") or table
        for tr in corps.find_all("tr", recursive=False):
            cellules = tr.find_all("td", recursive=False)
            if len(cellules) < 2:
                continue
            champs: OrderedDict = OrderedDict()
            for lib, td in zip(entetes, cellules):
                interne = extraire_paires(td)
                if len(interne) > 1:
                    for k, v in interne.items():
                        ajouter(champs, k, v)
                ajouter(champs, libelle_connu(lib) or colonne_generique(lib or "colonne"), td.get_text(" "))
            resultats.append((champs, tr))
    return resultats


def analyser_page(html: str, url: str) -> tuple[list[dict], set[str]]:
    soup = BeautifulSoup(html, "html.parser")
    for inutile in soup(["script", "style", "noscript", "select", "option", "label"]):
        inutile.decompose()

    consultations = []
    elements = lignes_tableau(soup) or [(extraire_paires(b), b) for b in blocs_consultation(soup)]
    for champs, element in elements:
        # Un vrai bloc a au moins un champ descriptif (écarte filtres et en-têtes).
        if not any(champs.get(k) for k in ("reference", "objet", "acheteur", "nature_prestation")):
            continue
        if not champs.get("reference"):
            m = re.search(r"\bn\s*[°ºo]\.?\s*:?\s*([\w/.\-]+)", element.get_text(" "), re.I)
            if m:
                champs["reference"] = m.group(1)
        detail, documents = liens(element, url)
        champs["lien_detail"] = detail
        champs["liens_documents"] = " ; ".join(documents)
        champs["texte_complet"] = " ⏐ ".join(lignes_texte(element))
        champs["page_source"] = url
        consultations.append(dict(champs))
    return consultations, pages_suivantes(soup, url)


def pages_suivantes(soup: BeautifulSoup, url: str) -> set[str]:
    base = urlparse(url)
    trouvees = set()
    for a in soup.find_all("a", href=True):
        cible = urlparse(urljoin(url, a["href"]))
        if cible.netloc != base.netloc or cible.path.rstrip("/") != base.path.rstrip("/"):
            continue
        params = parse_qs(cible.query)
        texte = nettoyer(a.get_text(" ")) or a.get("aria-label", "") or a.get("title", "")
        if any("page" in k.lower() for k in params) or RE_PAGINATION_TEXTE.match(texte or ""):
            if cible.query:
                trouvees.add(cible._replace(fragment="").geturl())
    return trouvees


# --------------------------------------------------------------------------- #
# Téléchargement
# --------------------------------------------------------------------------- #
class Client:
    def __init__(self, navigateur: bool, pause: float):
        self.pause = pause
        self.navigateur = navigateur
        if navigateur:
            from playwright.sync_api import sync_playwright  # import optionnel

            self._pw = sync_playwright().start()
            self._browser = self._pw.chromium.launch()
            self._page = self._browser.new_page(locale="fr-FR", user_agent=ENTETES["User-Agent"])
        else:
            import requests

            self._session = requests.Session()
            self._session.headers.update(ENTETES)

    def get(self, url: str) -> str:
        for essai in range(4):
            try:
                if self.navigateur:
                    self._page.goto(url, wait_until="networkidle", timeout=60_000)
                    html = self._page.content()
                else:
                    r = self._session.get(url, timeout=60)
                    r.raise_for_status()
                    r.encoding = r.apparent_encoding or r.encoding
                    html = r.text
                time.sleep(self.pause)
                return html
            except Exception as erreur:  # réseau instable : nouvel essai
                statut = getattr(getattr(erreur, "response", None), "status_code", None)
                if statut and 400 <= statut < 500 and statut != 429:
                    raise RuntimeError(f"{url} : HTTP {statut}") from erreur
                attente = 2 ** (essai + 1)
                print(f"  ! {url} : {erreur} — nouvel essai dans {attente} s", file=sys.stderr)
                time.sleep(attente)
        raise RuntimeError(f"Impossible de télécharger {url}")

    def fermer(self) -> None:
        if self.navigateur:
            self._browser.close()
            self._pw.stop()


def collecter(client: Client, url_depart: str, max_pages: int, param_page: str | None,
              dossier_html: Path | None) -> list[dict]:
    a_visiter, vues, toutes = [url_depart], set(), []
    signatures_vues = set()
    numero = 1
    while a_visiter and len(vues) < max_pages:
        url = a_visiter.pop(0)
        if url in vues:
            continue
        vues.add(url)
        print(f"Page {len(vues)} : {url}")
        html = client.get(url)
        if dossier_html:
            (dossier_html / f"page_{len(vues):03d}.html").write_text(html, encoding="utf-8")
        consultations, suivantes = analyser_page(html, url)
        nouvelles = 0
        for c in consultations:
            signature = c.get("reference") or c["texte_complet"]
            if signature not in signatures_vues:
                signatures_vues.add(signature)
                toutes.append(c)
                nouvelles += 1
        print(f"  {len(consultations)} consultation(s) trouvée(s), {nouvelles} nouvelle(s)")
        a_visiter.extend(sorted(u for u in suivantes if u not in vues and u not in a_visiter))

        # Pagination par paramètre (?page=N) si le site n'expose pas de liens.
        if param_page and not a_visiter and nouvelles:
            numero += 1
            sep = "&" if urlparse(url_depart).query else "?"
            a_visiter.append(f"{url_depart}{sep}{param_page}={numero}")
    return toutes


def enrichir_details(client: Client, consultations: list[dict]) -> None:
    for i, c in enumerate(consultations, 1):
        url = c.get("lien_detail")
        if not url:
            continue
        print(f"Détail {i}/{len(consultations)} : {url}")
        try:
            soup = BeautifulSoup(client.get(url), "html.parser")
        except RuntimeError as erreur:
            print(f"  ! {erreur}", file=sys.stderr)
            continue
        for inutile in soup(["script", "style", "noscript", "header", "footer", "nav"]):
            inutile.decompose()
        principal = soup.find("main") or soup.body or soup
        for k, v in extraire_paires(principal).items():
            if k in ("reference", "objet", "nature_prestation", "date_limite_remise_devis", "acheteur"):
                c.setdefault(k, v)  # la liste reste prioritaire
            else:
                ajouter(c, f"detail_{k}" if k in c else k, v)  # type: ignore[arg-type]
        _, documents = liens(principal, url)
        if documents:
            anciens = set(filter(None, c.get("liens_documents", "").split(" ; ")))
            c["liens_documents"] = " ; ".join(sorted(anciens | set(documents)))


# --------------------------------------------------------------------------- #
# Filtrage, regroupement, export
# --------------------------------------------------------------------------- #
def filtrer_et_grouper(consultations: list[dict], lancement: datetime):
    retenues, expirees, sans_date = [], [], []
    for c in consultations:
        limite = parser_date(c.get("date_limite_remise_devis"))
        if limite is None:
            sans_date.append(c)
            continue
        c["date_limite_iso"] = limite.isoformat()
        if limite > lancement:
            c["temps_restant"] = temps_restant(limite, lancement)
            retenues.append(c)
        else:
            expirees.append(c)
    retenues.sort(key=lambda c: c["date_limite_iso"])
    groupes: dict[str, list[dict]] = defaultdict(list)
    for c in retenues:
        groupes[c.get("nature_prestation") or NATURE_INCONNUE].append(c)
    groupes = dict(sorted(groupes.items(), key=lambda kv: (-len(kv[1]), kv[0])))
    return groupes, retenues, expirees, sans_date


COLONNES_EN_TETE = [
    "nature_prestation", "reference", "objet", "acheteur", "date_limite_remise_devis",
    "date_limite_iso", "temps_restant", "date_publication", "lieu_execution",
    "categorie", "estimation", "statut", "lien_detail", "liens_documents",
]


def colonnes(lignes: list[dict]) -> list[str]:
    toutes = OrderedDict((c, None) for c in COLONNES_EN_TETE)
    for ligne in lignes:
        for cle in ligne:
            toutes.setdefault(cle, None)
    # Le texte brut et la source en dernier.
    for fin in ("texte_complet", "page_source"):
        toutes.pop(fin, None)
        toutes[fin] = None
    return [c for c in toutes if any(c in l for l in lignes)] or list(COLONNES_EN_TETE)


def nom_feuille(nom: str, pris: set[str]) -> str:
    base = re.sub(r"[\[\]:*?/\\]", "-", nom)[:28] or "Feuille"
    candidat, n = base, 2
    while candidat.lower() in pris:
        candidat, n = f"{base[:25]}_{n}", n + 1
    pris.add(candidat.lower())
    return candidat


def exporter(dossier: Path, lancement: datetime, groupes, retenues, expirees, sans_date, total) -> Path:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    horodatage = lancement.strftime("%Y%m%d_%H%M%S")
    cols = colonnes(retenues + expirees + sans_date)

    wb = Workbook()
    synthese = wb.active
    synthese.title = "Synthèse"
    synthese.append(["Lancement du scraping", lancement.strftime("%d/%m/%Y %H:%M:%S"), "Africa/Casablanca"])
    synthese.append(["Consultations lues", total])
    synthese.append(["Retenues (date limite > lancement)", len(retenues)])
    synthese.append(["Exclues : date limite dépassée", len(expirees)])
    synthese.append(["Exclues : date limite illisible", len(sans_date)])
    synthese.append([])
    synthese.append(["Nature de prestation", "Nombre", "Date limite la plus proche", "Date limite la plus lointaine"])
    for cellule in synthese[7]:
        cellule.font = Font(bold=True)
    for nature, lignes in groupes.items():
        synthese.append([nature, len(lignes), lignes[0]["date_limite_remise_devis"],
                         lignes[-1]["date_limite_remise_devis"]])
    synthese.column_dimensions["A"].width = 45
    for lettre in "BCD":
        synthese.column_dimensions[lettre].width = 30

    def feuille(titre: str, lignes: list[dict]) -> None:
        ws = wb.create_sheet(titre)
        ws.append(cols)
        for cellule in ws[1]:
            cellule.font = Font(bold=True, color="FFFFFF")
            cellule.fill = PatternFill("solid", fgColor="1F4E78")
        for ligne in lignes:
            ws.append([ligne.get(c, "") for c in cols])
        for i, c in enumerate(cols, 1):
            ws.column_dimensions[get_column_letter(i)].width = 60 if c in ("objet", "texte_complet") else 24
        for rangee in ws.iter_rows(min_row=2):
            for cellule in rangee:
                cellule.alignment = Alignment(wrap_text=True, vertical="top")
        for i, c in enumerate(cols, 1):
            if c.startswith("lien") or c == "page_source":
                for rangee in range(2, ws.max_row + 1):
                    cellule = ws.cell(rangee, i)
                    premier = str(cellule.value or "").split(" ; ")[0]
                    if premier.startswith("http"):
                        cellule.hyperlink = premier
                        cellule.font = Font(color="0563C1", underline="single")
        ws.freeze_panes = "C2"
        ws.auto_filter.ref = ws.dimensions

    pris = {"synthèse"}
    feuille(nom_feuille("Toutes (en cours)", pris), retenues)
    for nature, lignes in groupes.items():
        feuille(nom_feuille(nature, pris), lignes)
    if expirees:
        feuille(nom_feuille("Exclues - expirées", pris), expirees)
    if sans_date:
        feuille(nom_feuille("Exclues - sans date", pris), sans_date)

    xlsx = dossier / f"bdc_par_nature_{horodatage}.xlsx"
    wb.save(xlsx)

    with open(dossier / f"bdc_en_cours_{horodatage}.csv", "w", newline="", encoding="utf-8-sig") as f:
        ecrivain = csv.DictWriter(f, fieldnames=cols, delimiter=";", extrasaction="ignore")
        ecrivain.writeheader()
        ecrivain.writerows(retenues)

    with open(dossier / f"bdc_par_nature_{horodatage}.json", "w", encoding="utf-8") as f:
        json.dump({
            "lancement": lancement.isoformat(),
            "source": URL_DEFAUT,
            "total_lu": total,
            "total_retenu": len(retenues),
            "par_nature": {n: {"nombre": len(l), "consultations": l} for n, l in groupes.items()},
        }, f, ensure_ascii=False, indent=2)
    return xlsx


def afficher(groupes: dict[str, list[dict]], lancement: datetime) -> None:
    print(f"\nBons de commande dont la date limite est après le {lancement:%d/%m/%Y à %H:%M:%S}")
    print("=" * 78)
    for nature, lignes in groupes.items():
        print(f"\n■ {nature} — {len(lignes)} consultation(s)")
        for c in lignes:
            print(f"  • [{c.get('reference', '?')}] {c.get('objet', '')[:90]}")
            print(f"      Acheteur : {c.get('acheteur', '-')}")
            print(f"      Limite   : {c.get('date_limite_remise_devis')}  (reste {c.get('temps_restant')})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=URL_DEFAUT, help="page de départ (liste des consultations)")
    parser.add_argument("--details", action="store_true", help="ouvrir chaque consultation pour récupérer tous les champs")
    parser.add_argument("--navigateur", action="store_true", help="utiliser Chromium (Playwright) pour les pages en JavaScript")
    parser.add_argument("--max-pages", type=int, default=300)
    parser.add_argument("--param-page", default="page", help="paramètre de pagination à essayer si aucun lien n'est trouvé ('' pour désactiver)")
    parser.add_argument("--pause", type=float, default=1.0, help="secondes entre deux requêtes")
    parser.add_argument("--fichier", nargs="*", help="analyser des pages HTML enregistrées au lieu du site")
    parser.add_argument("--sortie", default=str(Path(__file__).parent / "resultats"))
    parser.add_argument("--sauver-html", action="store_true", help="conserver le HTML brut des pages (débogage)")
    args = parser.parse_args()

    lancement = datetime.now(FUSEAU).replace(microsecond=0)
    dossier = Path(args.sortie) / lancement.strftime("%Y%m%d_%H%M%S")
    dossier.mkdir(parents=True, exist_ok=True)
    print(f"Lancement : {lancement:%d/%m/%Y %H:%M:%S} (heure du Maroc)")

    if args.fichier:
        consultations = []
        for chemin in args.fichier:
            trouvees, _ = analyser_page(Path(chemin).read_text(encoding="utf-8"), args.url)
            consultations.extend(trouvees)
    else:
        client = Client(args.navigateur, args.pause)
        try:
            dossier_html = dossier / "html" if args.sauver_html else None
            if dossier_html:
                dossier_html.mkdir()
            consultations = collecter(client, args.url, args.max_pages, args.param_page or None, dossier_html)
            if args.details:
                enrichir_details(client, consultations)
        finally:
            client.fermer()

    if not consultations:
        print("\nAucune consultation trouvée. Relancez avec --sauver-html (et --navigateur si la "
              "liste est chargée en JavaScript) puis vérifiez le HTML enregistré.", file=sys.stderr)
        return 1

    groupes, retenues, expirees, sans_date = filtrer_et_grouper(consultations, lancement)
    xlsx = exporter(dossier, lancement, groupes, retenues, expirees, sans_date, len(consultations))
    afficher(groupes, lancement)
    print(f"\n{len(consultations)} lue(s), {len(retenues)} retenue(s), {len(expirees)} expirée(s), "
          f"{len(sans_date)} sans date lisible.")
    print(f"Résultats : {dossier}\n  {xlsx.name} (+ .csv, .json)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
