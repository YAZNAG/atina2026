import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/catalog_service.dart';
import '../services/rewards_service.dart';
import '../services/profile_service.dart';

/// Contenu de l'accueil. Chaque bloc arrive indépendamment : l'écran s'affiche dès
/// que les catégories et les premiers produits sont là, au lieu d'attendre la
/// douzaine d'appels — c'est ce qui rendait l'ouverture lente sur l'app Expo.
@immutable
class HomeData {
  const HomeData({
    this.profile,
    this.address,
    this.categories = const [],
    this.articles = const [],
    this.popular = const [],
    this.topRated = const [],
    this.suggestions = const [],
    this.bestDeals = const [],
    this.flashProducts = const [],
    this.flashEndsAt,
    this.packs = const [],
    this.games = const [],
    this.ready = false,
  });

  final Map<String, dynamic>? profile;
  final Map<String, dynamic>? address;
  final List<Map<String, dynamic>> categories;
  final List<Map<String, dynamic>> articles;
  final List<Map<String, dynamic>> popular;
  final List<Map<String, dynamic>> topRated;
  final List<Map<String, dynamic>> suggestions;
  final List<Map<String, dynamic>> bestDeals;
  final List<Map<String, dynamic>> flashProducts;
  final String? flashEndsAt;
  final List<Map<String, dynamic>> packs;

  /// Jeux actifs du point de distribution (carte « Roue de la chance »).
  final List<Map<String, dynamic>> games;

  /// Vrai dès que l'écran a de quoi s'afficher.
  final bool ready;

  HomeData copyWith({
    Map<String, dynamic>? profile,
    Map<String, dynamic>? address,
    List<Map<String, dynamic>>? categories,
    List<Map<String, dynamic>>? articles,
    List<Map<String, dynamic>>? popular,
    List<Map<String, dynamic>>? topRated,
    List<Map<String, dynamic>>? suggestions,
    List<Map<String, dynamic>>? bestDeals,
    List<Map<String, dynamic>>? flashProducts,
    String? flashEndsAt,
    List<Map<String, dynamic>>? packs,
    List<Map<String, dynamic>>? games,
    bool? ready,
  }) =>
      HomeData(
        profile: profile ?? this.profile,
        address: address ?? this.address,
        categories: categories ?? this.categories,
        articles: articles ?? this.articles,
        popular: popular ?? this.popular,
        topRated: topRated ?? this.topRated,
        suggestions: suggestions ?? this.suggestions,
        bestDeals: bestDeals ?? this.bestDeals,
        flashProducts: flashProducts ?? this.flashProducts,
        flashEndsAt: flashEndsAt ?? this.flashEndsAt,
        packs: packs ?? this.packs,
        games: games ?? this.games,
        ready: ready ?? this.ready,
      );
}

class HomeNotifier extends StateNotifier<HomeData> {
  HomeNotifier() : super(const HomeData()) {
    load();
  }

  DateTime? _loadedAt;

  /// Données de moins de dix minutes : on garde l'affichage tel quel.
  bool get isFresh =>
      _loadedAt != null && DateTime.now().difference(_loadedAt!).inMinutes < 10;

  Future<void> load({bool force = false}) async {
    if (!force && isFresh) return;

    // Essentiels : ce qui décide du premier affichage.
    final essentials = Future.wait([
      CatalogService.categories().catchError((_) => state.categories),
      CatalogService.articles(limit: 20).catchError((_) => state.articles),
    ]).then<void>((res) {
      state = state.copyWith(categories: res[0], articles: res[1], ready: true);
    }).catchError((Object _) {
      // Catalogue injoignable : l'écran s'affiche avec son état vide.
      state = state.copyWith(ready: true);
    });

    // Le reste se pose au fur et à mesure ; un bloc en échec laisse les autres.
    final rest = <Future<void>>[
      _fill(ProfileService.get(), (v) => state = state.copyWith(profile: v)),
      _fill(ProfileService.addresses(), (list) {
        final def = list.where((a) => a['is_default'] == true).toList();
        state = state.copyWith(
          address: def.isNotEmpty ? def.first : (list.isNotEmpty ? list.first : null),
        );
      }),
      _fill(CatalogService.popular(), (v) => state = state.copyWith(popular: v)),
      _fill(CatalogService.topRated(), (v) => state = state.copyWith(topRated: v)),
      _fill(CatalogService.recommended(), (v) => state = state.copyWith(suggestions: v)),
      _fill(PromotionsService.packs(), (v) => state = state.copyWith(packs: v)),
      _fill(GamesService.list(), (v) => state = state.copyWith(games: v)),
      _fill(PromotionsService.home(), (data) {
        final ending = data['endingSoon'];
        state = state.copyWith(
          bestDeals: _list(data['bestDeals']),
          flashProducts: ending is Map ? _list(ending['products']) : const [],
          flashEndsAt: ending is Map ? ending['ends_at'] as String? : null,
        );
      }),
    ];

    await essentials;
    await Future.wait(rest);
    _loadedAt = DateTime.now();
  }

  Future<void> refresh() => load(force: true);

  Future<void> _fill<T>(Future<T> future, void Function(T value) apply) async {
    try {
      final value = await future;
      if (mounted) apply(value);
    } catch (_) {
      // Bloc indisponible : l'accueil s'affiche sans lui.
    }
  }

  static List<Map<String, dynamic>> _list(dynamic raw) {
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
  }
}

final homeProvider =
    StateNotifierProvider<HomeNotifier, HomeData>((ref) => HomeNotifier());
