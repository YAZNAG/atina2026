import 'tender.dart';

/// Préférences de notification : ce qui doit déclencher une alerte.
class AlertPrefs {
  final bool newTenders;
  final bool deadlineReminders;
  final int reminderDays;
  final Set<Category> categories;
  final Set<String> regions;
  final List<String> keywords;

  const AlertPrefs({
    this.newTenders = true,
    this.deadlineReminders = true,
    this.reminderDays = 3,
    this.categories = const {
      Category.travaux,
      Category.services,
      Category.fournitures,
    },
    this.regions = const {},
    this.keywords = const [],
  });

  AlertPrefs copyWith({
    bool? newTenders,
    bool? deadlineReminders,
    int? reminderDays,
    Set<Category>? categories,
    Set<String>? regions,
    List<String>? keywords,
  }) => AlertPrefs(
    newTenders: newTenders ?? this.newTenders,
    deadlineReminders: deadlineReminders ?? this.deadlineReminders,
    reminderDays: reminderDays ?? this.reminderDays,
    categories: categories ?? this.categories,
    regions: regions ?? this.regions,
    keywords: keywords ?? this.keywords,
  );

  /// Un avis ouvert correspond si sa catégorie et sa région sont suivies et, quand des
  /// mots-clés existent, s'il en contient au moins un.
  bool matches(Tender x) {
    if (!x.isOpen || !categories.contains(x.category)) return false;
    if (regions.isNotEmpty && !regions.contains(x.region)) return false;
    if (keywords.isEmpty) return true;
    final text = x.searchText;
    return keywords.any((k) {
      final n = normalize(k).trim();
      return n.isNotEmpty && text.contains(n);
    });
  }

  Map<String, dynamic> toJson() => {
    'newTenders': newTenders,
    'deadlineReminders': deadlineReminders,
    'reminderDays': reminderDays,
    'categories': categories.map((c) => c.name).toList(),
    'regions': regions.toList(),
    'keywords': keywords,
  };

  factory AlertPrefs.fromJson(Map<String, dynamic> j) {
    const d = AlertPrefs();
    List<String> strings(Object? v) =>
        v is List ? v.whereType<String>().toList() : const [];
    return AlertPrefs(
      newTenders: j['newTenders'] is bool
          ? j['newTenders'] as bool
          : d.newTenders,
      deadlineReminders: j['deadlineReminders'] is bool
          ? j['deadlineReminders'] as bool
          : d.deadlineReminders,
      reminderDays: j['reminderDays'] is int
          ? j['reminderDays'] as int
          : d.reminderDays,
      categories: j['categories'] is List
          ? Category.values
                .where((c) => strings(j['categories']).contains(c.name))
                .toSet()
          : d.categories,
      regions: strings(j['regions']).toSet(),
      keywords: strings(j['keywords']),
    );
  }
}
