import '../i18n/i18n.dart';

/// Nature des prestations, comme classées sur le portail des marchés publics.
enum Category { travaux, services, fournitures }

extension CategoryLabel on Category {
  String get label => switch (this) {
    Category.travaux => t('Travaux'),
    Category.services => t('Services'),
    Category.fournitures => t('Fournitures'),
  };
}

class TenderDocument {
  final String name;
  final int sizeKb;
  const TenderDocument(this.name, this.sizeKb);
}

/// Un avis d'appel d'offres (ou de consultation).
class Tender {
  final String id;
  final String reference;
  final String title;
  final String buyer;
  final String city;
  final String region;
  final Category category;
  final String procedure;
  final DateTime publishedAt;
  final DateTime deadline;
  final double? estimate;
  final double? deposit;
  final String executionDelay;
  final DateTime? siteVisit;
  final List<String> lots;
  final List<TenderDocument> documents;
  final String note;

  /// Le secteur privé publie aussi des consultations ; l'app les distingue du public.
  final bool isPrivate;

  const Tender({
    required this.id,
    required this.reference,
    required this.title,
    required this.buyer,
    required this.city,
    required this.region,
    required this.category,
    required this.procedure,
    required this.publishedAt,
    required this.deadline,
    this.estimate,
    this.deposit,
    required this.executionDelay,
    this.siteVisit,
    this.lots = const [],
    this.documents = const [],
    this.note = '',
    this.isPrivate = false,
  });

  bool get isOpen => deadline.isAfter(DateTime.now());

  int get dossierSizeKb => documents.fold(0, (s, d) => s + d.sizeKb);

  /// Texte en minuscules sans accents, pour la recherche par mots-clés.
  String get searchText => normalize(
    '$reference $title $buyer $city $region $procedure ${lots.join(' ')} $note',
  );

  /// Résumé en quelques points, construit à partir des champs de l'avis.
  List<String> get summary => [
    t("Objet : {title}.", {'title': bidi(title)}),
    t('Acheteur : {buyer}, exécution à {city}.', {
      'buyer': bidi(buyer),
      'city': bidi(city),
    }),
    if (estimate != null)
      t('Budget estimé : {v} TTC.', {'v': fmtMad(estimate!)}),
    if (deposit != null)
      t('Caution provisoire à prévoir : {v}.', {'v': fmtMad(deposit!)})
    else
      t('Pas de caution provisoire exigée.'),
    t("Délai d'exécution : {d}.", {'d': bidi(executionDelay)}),
    if (siteVisit != null)
      t('Visite des lieux le {date}.', {'date': fmtDateTime(siteVisit!)}),
    if (lots.length > 1) t('{n} lots distincts.', {'n': lots.length}),
    if (note.isNotEmpty) bidi(note),
  ];
}

/// Minuscules, sans accents ni ponctuation : « Équipement » == « equipement ».
String normalize(String s) {
  const from = 'àâäáãéèêëíìîïóòôöõúùûüçñœ';
  const to = 'aaaaaeeeeiiiiooooouuuucno';
  final b = StringBuffer();
  for (final ch in s.toLowerCase().split('')) {
    final i = from.indexOf(ch);
    b.write(i >= 0 ? to[i] : ch);
  }
  return b.toString().replaceAll(RegExp(r"[^a-z0-9؀-ۿ]+"), ' ');
}
