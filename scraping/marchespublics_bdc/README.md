# Scraping des bons de commande — marchespublics.gov.ma

Récupère les consultations de https://www.marchespublics.gov.ma/bdc/entreprise/consultation/.
Le script garde seulement celles dont la **date et heure limite de remise des devis** est
**postérieure à l'heure de lancement du script** (heure du Maroc). Il les **regroupe par
nature de prestation**, avec tous les champs affichés.

## Installation

```bash
cd scraping/marchespublics_bdc
python -m venv .venv && source .venv/bin/activate   # Windows : .venv\Scripts\activate
pip install -r requirements.txt
```

## Utilisation

```bash
python scraper_bdc.py                 # liste + filtre + regroupement
python scraper_bdc.py --details       # ouvre aussi chaque consultation : tous les champs possibles
python scraper_bdc.py --navigateur    # si la liste est chargée en JavaScript (pip install playwright && playwright install chromium)
python scraper_bdc.py --sauver-html   # garde le HTML brut des pages pour vérifier l'extraction
python scraper_bdc.py --fichier page1.html page2.html   # analyse des pages enregistrées depuis le navigateur
```

Options utiles : `--max-pages N`, `--pause 1.5` (délai entre requêtes), `--sortie dossier`.

## Résultats (`resultats/<date_heure>/`)

| Fichier | Contenu |
|---|---|
| `bdc_par_nature_*.xlsx` | Feuille **Synthèse** (nombre par nature, échéances la plus proche et la plus lointaine), feuille **Toutes (en cours)**, **une feuille par nature de prestation**, et les consultations exclues (expirées ou sans date lisible) pour contrôle |
| `bdc_en_cours_*.csv` | Toutes les consultations retenues (séparateur `;`, s'ouvre dans Excel) |
| `bdc_par_nature_*.json` | Même contenu, regroupé par nature |

Colonnes : nature de prestation, référence, objet, acheteur, date limite (texte et ISO), temps
restant, date de publication, lieu, catégorie, estimation, statut, lien vers le détail, liens
des documents. S'y ajoutent tous les autres champs « libellé : valeur » trouvés sur la page,
plus le texte complet du bloc. Le tri se fait par date limite, la plus proche en premier.

## Fonctionnement

L'extraction ne dépend pas des classes CSS. Le script repère chaque bloc contenant le libellé
« Date et heure limite… », sous forme de carte ou de ligne de tableau. Il lit ensuite les
paires libellé / valeur et suit les liens de pagination (`?page=N`).

Si une date n'a pas d'heure, elle compte comme 23:59. Les consultations dont la date est
illisible sont listées à part et ne sont pas perdues.

Si le résultat est vide ou incomplet, relancez avec `--sauver-html` (et `--navigateur` au
besoin), puis vérifiez le HTML enregistré.
