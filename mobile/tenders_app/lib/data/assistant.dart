import '../i18n/i18n.dart';
import '../models/filter.dart';
import '../models/tender.dart';
import 'demo_tenders.dart';

class AssistantReply {
  final String text;
  final List<Tender> tenders;
  const AssistantReply(this.text, [this.tenders = const []]);
}

/// Assistant de recherche hors ligne : il comprend une demande en langage courant
/// (catégorie, ville ou région, échéance, budget, mots-clés) et renvoie les avis
/// correspondants. Un assistant fondé sur un modèle de langage demandera un serveur,
/// la clé d'API ne pouvant pas être embarquée dans l'app ; il remplacera cette classe.
class SearchAssistant {
  final List<Tender> tenders;
  SearchAssistant(this.tenders);

  static const _categoryWords = {
    Category.travaux: [
      'travaux',
      'construction',
      'batiment',
      'route',
      'voirie',
      'piste',
      'digue',
      'rehabilitation',
      'amenagement',
      'eclairage',
      'btp',
      'اشغال',
      'بناء',
    ],
    Category.services: [
      'service',
      'services',
      'etude',
      'etudes',
      'nettoyage',
      'gardiennage',
      'formation',
      'transport',
      'informatique',
      'logiciel',
      'plateforme',
      'web',
      'conseil',
      'خدمات',
      'دراسة',
    ],
    Category.fournitures: [
      'fourniture',
      'fournitures',
      'acquisition',
      'achat',
      'materiel',
      'mobilier',
      'medicaments',
      'denrees',
      'ambulance',
      'ambulances',
      'equipement',
      'توريد',
      'اقتناء',
    ],
  };

  /// Mots outils ignorés quand on cherche des mots-clés libres.
  static const _stop = {
    'je',
    'cherche',
    'trouve',
    'moi',
    'des',
    'les',
    'le',
    'la',
    'de',
    'du',
    'un',
    'une',
    'a',
    'au',
    'aux',
    'en',
    'et',
    'ou',
    'pour',
    'sur',
    'dans',
    'avec',
    'qui',
    'que',
    'quels',
    'quelles',
    'quel',
    'offres',
    'offre',
    'appel',
    'appels',
    'ao',
    'marche',
    'marches',
    'public',
    'publics',
    'cette',
    'semaine',
    'mois',
    'plus',
    'moins',
    'millions',
    'million',
    'mdh',
    'dh',
    'mad',
    'urgent',
    'urgents',
    'cloture',
    'bientot',
    'region',
    'ville',
    'il',
    'y',
    'quoi',
    'neuf',
    'nouveau',
    'nouveaux',
    'recents',
    'recent',
    'montant',
    'budget',
    'gros',
    'grands',
    'prive',
    'prives',
    'entreprise',
    'entreprises',
    'secteur',
    'resume',
    'resumer',
    'est',
    'ce',
    'sont',
    'ai',
    'besoin',
    'liste',
    'montre',
    'donne',
    'svp',
    'stp',
    'merci',
    'bonjour',
    'salut',
    'bon',
    'bons',
    'commande',
    'commandes',
    'bdc',
    'devis',
  };

  AssistantReply answer(String message, {Tender? about}) {
    if (about != null) return _explain(about);

    final q = normalize(message);
    final words = q.split(' ').where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) {
      return AssistantReply(
        t(
          'Dites-moi ce que vous cherchez : un secteur, une ville, un délai ou un budget.',
        ),
      );
    }

    var filter = const TenderFilter(sort: SortBy.deadline);
    final understood = <String>[];

    final cats = <Category>{
      for (final e in _categoryWords.entries)
        if (e.value.any(words.contains)) e.key,
    };
    if (cats.isNotEmpty) {
      filter = filter.copyWith(categories: cats);
      understood.add(cats.map((c) => c.label).join(', '));
    }

    final regionHits = <String>{};
    final cityHits = <String>{};
    final padded = ' ${words.join(' ')} ';
    for (final x in tenders) {
      if (padded.contains(' ${normalize(x.city).trim()} ')) {
        cityHits.add(x.city);
      }
    }
    for (final r in regions) {
      final first = normalize(r).trim().split(' ').first;
      if (words.contains(first)) regionHits.add(r);
    }
    if (regionHits.isNotEmpty) {
      filter = filter.copyWith(regions: regionHits);
      understood.addAll(regionHits);
    }

    if (q.contains('semaine') ||
        q.contains('urgent') ||
        q.contains('bientot') ||
        q.contains('cloture')) {
      filter = filter.copyWith(deadline: DeadlineWindow.d7);
      understood.add(t('clôture sous 7 jours'));
    } else if (q.contains('mois')) {
      filter = filter.copyWith(deadline: DeadlineWindow.d30);
      understood.add(t('clôture sous 30 jours'));
    }

    if (q.contains('nouveau') ||
        q.contains('recent') ||
        q.contains('quoi de neuf')) {
      filter = filter.copyWith(
        published: PublishedWindow.h48,
        sort: SortBy.recent,
      );
      understood.add(t('publiés depuis 48 h'));
    }

    if (q.contains('bon de commande') ||
        q.contains('bons de commande') ||
        words.contains('bdc')) {
      filter = filter.withKind(TenderKind.bdc);
      understood.add(t('bons de commande'));
    }

    if (q.contains('prive')) {
      filter = filter.copyWith(privateOnly: true);
      understood.add(t('secteur privé'));
    }

    final budget = _budget(q);
    if (budget != Budget.any) {
      filter = filter.copyWith(budget: budget, sort: SortBy.amount);
      understood.add(budget.label);
    }

    // Les mots restants, hors catégories, villes et mots outils, servent de mots-clés.
    final known = {
      for (final l in _categoryWords.values) ...l,
      for (final c in cityHits) ...normalize(c).split(' '),
      for (final r in regionHits) ...normalize(r).split(' '),
    };
    final free = words
        .where((w) => w.length > 2 && !_stop.contains(w) && !known.contains(w))
        .where((w) => int.tryParse(w) == null)
        .toList();

    var results = filter.apply(tenders, '');
    if (cityHits.isNotEmpty) {
      results = results.where((x) => cityHits.contains(x.city)).toList();
      understood.addAll(cityHits);
    }
    if (free.isNotEmpty) {
      final narrowed = results
          .where((x) => free.any((w) => x.searchText.contains(w)))
          .toList();
      if (narrowed.isNotEmpty || understood.isEmpty) {
        results = narrowed;
        understood.add('« ${free.join(' ')} »');
      }
    }

    if (understood.isEmpty) {
      return AssistantReply(
        t(
          "Je n'ai pas bien compris. Essayez par exemple : « travaux à Marrakech », « services qui clôturent cette semaine » ou « fournitures de plus de 5 millions ».",
        ),
      );
    }
    final criteria = understood.join(' · ');
    if (results.isEmpty) {
      return AssistantReply(
        t(
          'Aucun appel d\'offres ouvert ne correspond à : {c}. Élargissez la région ou retirez un critère.',
          {'c': criteria},
        ),
      );
    }
    final head = results.length == 1
        ? t("J'ai trouvé 1 appel d'offres ouvert pour : {c}.", {'c': criteria})
        : t("J'ai trouvé {n} appels d'offres ouverts pour : {c}.", {
            'n': results.length,
            'c': criteria,
          });
    final first = results.first;
    final tip = t('Le plus urgent clôture le {date}.', {
      'date': fmtDate(first.deadline),
    });
    return AssistantReply('$head $tip', results.take(5).toList());
  }

  AssistantReply _explain(Tender x) {
    final lines = x.summary.map((s) => '• $s').join('\n');
    final d = daysUntil(x.deadline);
    final urgency = d <= 3
        ? t(
            "Attention : il reste {n} jour(s), préparez le dossier administratif et la caution dès aujourd'hui.",
            {'n': d},
          )
        : t('Vous avez {n} jours pour préparer votre offre.', {'n': d});
    return AssistantReply('${t('Voici l\'essentiel :')}\n$lines\n\n$urgency', [
      x,
    ]);
  }

  Budget _budget(String q) {
    final m = RegExp(
      r'(plus|moins) de (\d+(?: \d+)?) ?(m|million|millions|mdh)?\b',
    ).firstMatch(q);
    if (m == null) return Budget.any;
    final value = double.tryParse(m.group(2)!.replaceAll(' ', '')) ?? 0;
    final millions = m.group(3) != null || value < 1000
        ? value
        : value / 1000000;
    if (m.group(1) == 'moins') {
      return millions <= 1 ? Budget.lt1m : Budget.m1to5;
    }
    if (millions >= 20) return Budget.gt20m;
    if (millions >= 5) return Budget.m5to20;
    return Budget.m1to5;
  }
}
