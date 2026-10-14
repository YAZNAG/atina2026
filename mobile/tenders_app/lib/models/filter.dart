import '../i18n/i18n.dart';
import 'tender.dart';

enum SortBy { recent, deadline, amount }

enum DeadlineWindow { any, d7, d15, d30 }

enum PublishedWindow { any, h48, d7, d30 }

enum Budget { any, lt1m, m1to5, m5to20, gt20m }

extension SortByLabel on SortBy {
  String get label => switch (this) {
    SortBy.recent => t('Plus récents'),
    SortBy.deadline => t('Date limite proche'),
    SortBy.amount => t('Montant estimé'),
  };
}

extension DeadlineWindowX on DeadlineWindow {
  int? get days => switch (this) {
    DeadlineWindow.any => null,
    DeadlineWindow.d7 => 7,
    DeadlineWindow.d15 => 15,
    DeadlineWindow.d30 => 30,
  };
  String get label =>
      days == null ? t('Toutes') : t('Sous {n} jours', {'n': days});
}

extension PublishedWindowX on PublishedWindow {
  Duration? get window => switch (this) {
    PublishedWindow.any => null,
    PublishedWindow.h48 => const Duration(hours: 48),
    PublishedWindow.d7 => const Duration(days: 7),
    PublishedWindow.d30 => const Duration(days: 30),
  };
  String get label => switch (this) {
    PublishedWindow.any => t('Toutes'),
    PublishedWindow.h48 => t('48 dernières heures'),
    PublishedWindow.d7 => t('7 derniers jours'),
    PublishedWindow.d30 => t('30 derniers jours'),
  };
}

extension BudgetX on Budget {
  String get label => switch (this) {
    Budget.any => t('Tous'),
    Budget.lt1m => t('Moins de 1 M'),
    Budget.m1to5 => t('1 à 5 M'),
    Budget.m5to20 => t('5 à 20 M'),
    Budget.gt20m => t('Plus de 20 M'),
  };

  bool contains(double? v) {
    if (this == Budget.any) return true;
    if (v == null) return false;
    const m = 1000000;
    return switch (this) {
      Budget.any => true,
      Budget.lt1m => v < m,
      Budget.m1to5 => v >= m && v < 5 * m,
      Budget.m5to20 => v >= 5 * m && v < 20 * m,
      Budget.gt20m => v >= 20 * m,
    };
  }
}

/// Critères de recherche avancée. Immuable : l'écran de filtres travaille sur une copie
/// et ne l'applique qu'à la validation.
class TenderFilter {
  final Set<Category> categories;
  final Set<String> regions;
  final Set<String> procedures;
  final DeadlineWindow deadline;
  final PublishedWindow published;
  final Budget budget;
  final bool privateOnly;

  /// Appels d'offres ou bons de commande ; `null` : les deux.
  final TenderKind? kind;
  final SortBy sort;

  const TenderFilter({
    this.categories = const {},
    this.regions = const {},
    this.procedures = const {},
    this.deadline = DeadlineWindow.any,
    this.published = PublishedWindow.any,
    this.budget = Budget.any,
    this.privateOnly = false,
    this.kind,
    this.sort = SortBy.recent,
  });

  /// Nombre de critères actifs (le tri n'en est pas un), affiché sur le bouton Filtres.
  int get activeCount =>
      (categories.isEmpty ? 0 : 1) +
      (regions.isEmpty ? 0 : 1) +
      (procedures.isEmpty ? 0 : 1) +
      (deadline == DeadlineWindow.any ? 0 : 1) +
      (published == PublishedWindow.any ? 0 : 1) +
      (budget == Budget.any ? 0 : 1) +
      (privateOnly ? 1 : 0);

  TenderFilter copyWith({
    Set<Category>? categories,
    Set<String>? regions,
    Set<String>? procedures,
    DeadlineWindow? deadline,
    PublishedWindow? published,
    Budget? budget,
    bool? privateOnly,
    SortBy? sort,
  }) => TenderFilter(
    categories: categories ?? this.categories,
    regions: regions ?? this.regions,
    procedures: procedures ?? this.procedures,
    deadline: deadline ?? this.deadline,
    published: published ?? this.published,
    budget: budget ?? this.budget,
    privateOnly: privateOnly ?? this.privateOnly,
    kind: kind,
    sort: sort ?? this.sort,
  );

  /// Change le type d'avis affiché (`null` : les deux).
  TenderFilter withKind(TenderKind? k) => TenderFilter(
    categories: categories,
    regions: regions,
    procedures: procedures,
    deadline: deadline,
    published: published,
    budget: budget,
    privateOnly: privateOnly,
    kind: k,
    sort: sort,
  );

  /// Garde le tri choisi, retire tous les critères.
  TenderFilter cleared() => TenderFilter(sort: sort, kind: kind);

  bool matches(Tender x, String query, DateTime now) {
    if (x.cancelled || !x.deadline.isAfter(now)) return false;
    if (kind != null && x.kind != kind) return false;
    if (categories.isNotEmpty && !categories.contains(x.category)) return false;
    if (regions.isNotEmpty && !regions.contains(x.region)) return false;
    if (procedures.isNotEmpty && !procedures.contains(x.procedure)) {
      return false;
    }
    if (privateOnly && !x.isPrivate) return false;
    if (!budget.contains(x.estimate)) return false;
    final days = deadline.days;
    if (days != null && daysUntil(x.deadline, now) > days) return false;
    final win = published.window;
    if (win != null && now.difference(x.publishedAt) > win) return false;
    return matchesQuery(x, query);
  }

  List<Tender> apply(List<Tender> all, String query, [DateTime? now]) {
    final n = now ?? DateTime.now();
    final out = all.where((x) => matches(x, query, n)).toList();
    switch (sort) {
      case SortBy.recent:
        out.sort((a, b) => b.publishedAt.compareTo(a.publishedAt));
      case SortBy.deadline:
        out.sort((a, b) => a.deadline.compareTo(b.deadline));
      case SortBy.amount:
        out.sort((a, b) => (b.estimate ?? -1).compareTo(a.estimate ?? -1));
    }
    return out;
  }
}

/// Tous les mots de la requête doivent apparaître dans l'avis (ordre indifférent).
bool matchesQuery(Tender x, String query) {
  final words = normalize(query).split(' ').where((w) => w.isNotEmpty);
  if (words.isEmpty) return true;
  final text = x.searchText;
  return words.every(text.contains);
}
