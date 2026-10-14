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

  /// Absent du portail : seuls les avis d'exemple le renseignent.
  final String? executionDelay;
  final DateTime? siteVisit;
  final List<String> lots;

  /// Nombre de lots quand leur détail n'est pas connu (avis du portail).
  final int? lotsCount;
  final List<String> qualifications;
  final List<TenderDocument> documents;
  final String note;

  /// Fiche officielle sur le portail, où se télécharge le dossier de consultation.
  final String? portalUrl;

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
    this.executionDelay,
    this.siteVisit,
    this.lots = const [],
    this.lotsCount,
    this.qualifications = const [],
    this.documents = const [],
    this.note = '',
    this.portalUrl,
    this.isPrivate = false,
  });

  /// Avis renvoyé par l'API (`GET /api/tenders`). Lève [FormatException] si un
  /// champ indispensable manque.
  factory Tender.fromJson(Map<String, dynamic> j) {
    String str(String k) => j[k] is String ? (j[k] as String).trim() : '';
    DateTime? date(String k) =>
        j[k] is String ? DateTime.tryParse(j[k] as String)?.toLocal() : null;
    double? amount(String k) => j[k] is num ? (j[k] as num).toDouble() : null;

    final id = str('id');
    final deadline = date('deadline');
    if (id.isEmpty || deadline == null) {
      throw const FormatException('avis sans identifiant ou sans date limite');
    }
    final category = Category.values.firstWhere(
      (c) => c.name == j['category'],
      orElse: () => Category.services,
    );
    final dce = j['dceSizeKb'] is int ? j['dceSizeKb'] as int : null;
    return Tender(
      id: id,
      reference: str('reference'),
      title: str('title'),
      buyer: str('buyer'),
      city: str('city'),
      region: str('region'),
      category: category,
      procedure: str('procedure'),
      publishedAt: date('publishedAt') ?? date('firstSeenAt') ?? deadline,
      deadline: deadline,
      estimate: amount('estimate'),
      deposit: amount('deposit'),
      siteVisit: date('siteVisit'),
      lotsCount: j['lotsCount'] is int ? j['lotsCount'] as int : null,
      qualifications: j['qualifications'] is List
          ? (j['qualifications'] as List).whereType<String>().toList()
          : const [],
      documents: [
        if (dce != null)
          TenderDocument('Dossier de consultation (DCE).zip', dce),
      ],
      portalUrl: str('portalUrl').isEmpty ? null : str('portalUrl'),
    );
  }

  /// Nombre de lots, qu'on en connaisse le détail ou seulement le total.
  int get lotTotal => lots.isNotEmpty ? lots.length : (lotsCount ?? 0);

  bool get isOpen => deadline.isAfter(DateTime.now());

  int get dossierSizeKb => documents.fold(0, (s, d) => s + d.sizeKb);

  /// Texte en minuscules sans accents, pour la recherche par mots-clés.
  String get searchText => normalize(
    '$reference $title $buyer $city $region $procedure ${lots.join(' ')} '
    '${qualifications.join(' ')} $note',
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
    if (executionDelay != null)
      t("Délai d'exécution : {d}.", {'d': bidi(executionDelay!)}),
    if (siteVisit != null)
      t('Visite des lieux le {date}.', {'date': fmtDateTime(siteVisit!)}),
    if (lotTotal > 1) t('{n} lots distincts.', {'n': lotTotal}),
    if (qualifications.isNotEmpty)
      t('Qualification exigée : voir la liste ci-dessous.'),
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
