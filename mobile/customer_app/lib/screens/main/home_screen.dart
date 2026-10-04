import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../i18n/i18n.dart';
import '../../state/home_state.dart';
import '../../theme/atina.dart';
import '../../theme/widgets.dart';
import '../../widgets/product_card.dart';

/// Accueil, dans l'ordre de la maquette Figma : localisation et points, recherche,
/// offres à durée limitée, catégories, roue de la chance, packs, sélections,
/// parrainage, puis la grille de tous les produits.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final home = ref.watch(homeProvider);

    if (!home.ready) {
      return const Center(child: CircularProgressIndicator(color: C.red));
    }

    final width = MediaQuery.sizeOf(context).width;
    final cardWidth = (width - 48) / 2;
    final referral = home.profile?['referral_code'] as String?;

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: C.red,
        onRefresh: () => ref.read(homeProvider.notifier).refresh(),
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: _Header(home: home)),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(S.lg, 4, S.lg, S.md),
                child: SearchField(
                  value: '',
                  readOnly: true,
                  onChanged: (_) {},
                  onTap: () => context.push('/main/search'),
                ),
              ),
            ),
            if (home.flashProducts.isNotEmpty)
              _Carousel(
                title: t('Offres à durée limitée'),
                articles: home.flashProducts,
                cardWidth: cardWidth,
                endsAt: home.flashEndsAt,
                onSeeAll: () => context.push('/main/offers'),
              ),
            if (home.categories.isNotEmpty)
              SliverToBoxAdapter(
                child: _Categories(
                  categories: home.categories,
                  onSeeAll: () => context.push('/main/categories'),
                ),
              ),
            SliverToBoxAdapter(child: _WheelCard(games: home.games)),
            if (home.packs.isNotEmpty)
              SliverToBoxAdapter(child: _Packs(packs: home.packs)),
            if (home.bestDeals.isNotEmpty)
              _Carousel(
                title: t('Meilleures offres'),
                articles: home.bestDeals,
                cardWidth: cardWidth,
                onSeeAll: () => context.push('/main/list/bestDeals?title=Meilleures offres'),
              ),
            if (home.popular.isNotEmpty)
              _Carousel(
                title: t('Produits populaires'),
                articles: home.popular,
                cardWidth: cardWidth,
                onSeeAll: () => context.push('/main/list/popular?title=Produits populaires'),
              ),
            if (home.topRated.isNotEmpty)
              _Carousel(
                title: t('Notés 5 étoiles'),
                articles: home.topRated,
                cardWidth: cardWidth,
                onSeeAll: () => context.push('/main/list/topRated?title=Notés 5 étoiles'),
              ),
            if (home.suggestions.isNotEmpty)
              _Carousel(
                title: t('Suggestions pour vous'),
                articles: home.suggestions,
                cardWidth: cardWidth,
                onSeeAll: () =>
                    context.push('/main/list/suggestions?title=Suggestions pour vous'),
              ),
            SliverToBoxAdapter(child: _ReferralCard(code: referral)),
            SliverToBoxAdapter(child: SectionTitle(title: t('Tous les produits'))),
            if (home.articles.isEmpty)
              SliverToBoxAdapter(
                child: EmptyState(title: t('Aucun produit trouvé')),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(S.lg, 0, S.lg, 120),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: S.lg,
                    crossAxisSpacing: S.lg,
                    mainAxisExtent: 228,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, i) => ProductCard(
                      article: home.articles[i],
                      onTap: () => context.push(
                        '/main/product/${home.articles[i]['id']}',
                      ),
                    ),
                    childCount: home.articles.length,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// En-tête de la maquette : adresse de livraison, pastille de points, cloche
/// de notifications, avatar.
class _Header extends StatelessWidget {
  const _Header({required this.home});

  final HomeData home;

  @override
  Widget build(BuildContext context) {
    final address = home.address;
    final profile = home.profile;
    final name = (profile?['name'] as String?) ?? '';
    final avatar = profile?['avatar_url'] as String?;
    final points = (profile?['points_balance'] as num?) ?? 0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: S.lg, vertical: S.md),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: () => context.push('/profile/location'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.location_on_outlined, size: 14, color: C.red),
                      const SizedBox(width: 4),
                      Text(t('Livrer à'), style: ts(12, color: const Color(0xFF6B7280))),
                      const Icon(Icons.keyboard_arrow_down, size: 16, color: C.ink),
                    ],
                  ),
                  Text(
                    address != null
                        ? [
                            address['street_name'],
                            address['quartier'],
                            address['city'],
                          ].whereType<String>().where((s) => s.isNotEmpty).join(', ')
                        : t('Ajouter une adresse'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ts(15, weight: F.bold),
                  ),
                ],
              ),
            ),
          ),
          // Pastille de points de la maquette, qui ouvre la fidélité.
          _PointsPill(points: points),
          IconButton(
            onPressed: () => context.push('/profile/notifications'),
            icon: const Icon(Icons.notifications_none, size: 22, color: C.ink),
            tooltip: t('Notifications'),
            visualDensity: VisualDensity.compact,
          ),
          InkWell(
            onTap: () => context.push('/profile'),
            customBorder: const CircleBorder(),
            child: Container(
              width: 36,
              height: 36,
              clipBehavior: Clip.antiAlias,
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: C.red, shape: BoxShape.circle),
              child: avatar != null && avatar.isNotEmpty
                  ? Image.network(Config.media(avatar),
                      fit: BoxFit.cover, width: 36, height: 36)
                  : Text(
                      name.isEmpty ? '?' : name.characters.first.toUpperCase(),
                      style: ts(15, weight: F.bold, color: Colors.white),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PointsPill extends StatelessWidget {
  const _PointsPill({required this.points});

  final num points;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.push('/profile/loyalty'),
      borderRadius: BorderRadius.circular(R.pill),
      child: Container(
        padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
        margin: const EdgeInsets.only(right: 2),
        decoration: BoxDecoration(
          color: C.redSoft,
          borderRadius: BorderRadius.circular(R.pill),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/images/atina/coin.png', width: 18, height: 18),
            const SizedBox(width: 5),
            Text(
              fmtNumber(points, digits: 0),
              style: ts(12.5, weight: F.bold, color: C.red),
            ),
          ],
        ),
      ),
    );
  }
}

/// Carte « Roue de la chance » de la maquette : bandeau rouge, roue, tours
/// restants, bouton de jeu.
class _WheelCard extends StatelessWidget {
  const _WheelCard({required this.games});

  final List<Map<String, dynamic>> games;

  @override
  Widget build(BuildContext context) {
    final jeu = games.isNotEmpty ? games.first : null;
    final tours = (jeu?['available_plays'] as num?)?.toInt() ?? 0;

    return Padding(
      padding: const EdgeInsets.fromLTRB(S.lg, S.xl, S.lg, 0),
      child: InkWell(
        onTap: () => context.push('/games'),
        borderRadius: BorderRadius.circular(R.lg),
        child: Container(
          padding: const EdgeInsets.all(S.md),
          decoration: BoxDecoration(
            color: C.red,
            borderRadius: BorderRadius.circular(R.lg),
            boxShadow: buttonShadow,
          ),
          child: Row(
            children: [
              Image.asset('assets/images/atina/wheel.png', width: 56, height: 56),
              const SizedBox(width: S.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      jeu != null ? tName(jeu) : t('Roue de la chance'),
                      style: ts(15.5, weight: F.bold, color: Colors.white),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      tours > 0
                          ? '$tours ${tours > 1 ? t('tours disponibles') : t('tour disponible')}'
                          : t('Tournez la roue et gagnez'),
                      style: ts(12.5, color: Colors.white.withValues(alpha: 0.9)),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  color: C.yellow,
                  borderRadius: BorderRadius.circular(R.pill),
                ),
                child: Text(t('Jouer'), style: ts(12.5, weight: F.bold)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Bandeau des packs de la maquette (« Pack Essentiel », « Pack Bébé »…).
class _Packs extends StatelessWidget {
  const _Packs({required this.packs});

  final List<Map<String, dynamic>> packs;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: t('Packs'),
          onSeeAll: () => context.push('/main/offers'),
        ),
        SizedBox(
          height: 104,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: S.lg),
            itemCount: packs.length,
            separatorBuilder: (_, __) => const SizedBox(width: S.md),
            itemBuilder: (context, i) {
              final pack = packs[i];
              return InkWell(
                onTap: () => context.push('/main/pack/${pack['id']}'),
                borderRadius: BorderRadius.circular(R.md),
                child: Container(
                  width: 240,
                  padding: const EdgeInsets.all(S.md),
                  decoration: BoxDecoration(
                    color: C.redTint,
                    borderRadius: BorderRadius.circular(R.md),
                    border: Border.all(color: C.redSoft),
                  ),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(R.sm),
                        child: SizedBox(
                          width: 62,
                          height: 62,
                          child: RemoteImage(
                            url: pack['image_url'] as String?,
                            fit: BoxFit.contain,
                          ),
                        ),
                      ),
                      const SizedBox(width: S.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              tName(pack),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: ts(13, weight: F.semi, height: 1.3),
                            ),
                            if (pack['price_ttc'] != null)
                              Text(
                                fmtPrice(pack['price_ttc'] as num),
                                style: ts(14, weight: F.black, color: C.red),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Carte « Parrainer un proche » de la maquette : le code se copie d'un geste.
class _ReferralCard extends StatelessWidget {
  const _ReferralCard({required this.code});

  final String? code;

  @override
  Widget build(BuildContext context) {
    if (code == null || code!.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(S.lg, S.xl, S.lg, 0),
      child: Container(
        padding: const EdgeInsets.all(S.md),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFBEB),
          borderRadius: BorderRadius.circular(R.lg),
          border: Border.all(color: const Color(0xFFFEF3C7)),
        ),
        child: Row(
          children: [
            Image.asset('assets/images/atina/gift.png', width: 44, height: 44),
            const SizedBox(width: S.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(t('Parrainer un proche'), style: ts(14.5, weight: F.bold)),
                  const SizedBox(height: 2),
                  Text(
                    t('Partagez votre code et gagnez des points à sa première commande.'),
                    style: ts(12, color: C.grey, height: 1.4),
                  ),
                ],
              ),
            ),
            const SizedBox(width: S.sm),
            Builder(
              builder: (inner) => InkWell(
                onTap: () async {
                  final messenger = ScaffoldMessenger.of(inner);
                  await Clipboard.setData(ClipboardData(text: code!));
                  messenger.showSnackBar(
                    SnackBar(
                      content: Text(t('Copié !'), style: ts(13.5, color: Colors.white)),
                      backgroundColor: C.ink,
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
                borderRadius: BorderRadius.circular(R.pill),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: C.ink,
                    borderRadius: BorderRadius.circular(R.pill),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(code!, style: ts(12, weight: F.bold, color: Colors.white)),
                      const SizedBox(width: 5),
                      const Icon(Icons.copy, size: 13, color: Colors.white),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bandeau de catégories rondes, avec lien « Voir tout ».
class _Categories extends StatelessWidget {
  const _Categories({required this.categories, required this.onSeeAll});

  final List<Map<String, dynamic>> categories;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(title: t('Catégories'), onSeeAll: onSeeAll),
        SizedBox(
          height: 104,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: S.lg),
            itemCount: categories.length,
            separatorBuilder: (_, __) => const SizedBox(width: S.md),
            itemBuilder: (context, i) {
              final cat = categories[i];
              return SizedBox(
                width: 72,
                child: InkWell(
                  onTap: () => context.push('/main/category/${cat['id']}'),
                  borderRadius: BorderRadius.circular(R.md),
                  child: Column(
                    children: [
                      Container(
                        width: 60,
                        height: 60,
                        clipBehavior: Clip.antiAlias,
                        decoration: const BoxDecoration(
                          color: C.bgSoft,
                          shape: BoxShape.circle,
                        ),
                        child: RemoteImage(url: cat['image_url'] as String?),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        tName(cat),
                        maxLines: 2,
                        textAlign: TextAlign.center,
                        overflow: TextOverflow.ellipsis,
                        style: ts(11, weight: F.medium, color: C.body, height: 1.2),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Section horizontale de produits (offres, populaires, suggestions…).
class _Carousel extends StatelessWidget {
  const _Carousel({
    required this.title,
    required this.articles,
    required this.cardWidth,
    this.endsAt,
    this.onSeeAll,
  });

  final String title;
  final List<Map<String, dynamic>> articles;
  final double cardWidth;
  final String? endsAt;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionTitle(title: title, onSeeAll: onSeeAll),
          SizedBox(
            height: 228,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: S.lg),
              itemCount: articles.length,
              separatorBuilder: (_, __) => const SizedBox(width: S.md),
              itemBuilder: (context, i) {
                // Sur une vente flash, l'échéance du bloc s'applique à chaque carte.
                final article = endsAt == null
                    ? articles[i]
                    : {
                        ...articles[i],
                        'flash_ends_at': articles[i]['flash_ends_at'] ?? endsAt,
                      };
                return ProductCard(
                  article: article,
                  width: cardWidth,
                  onTap: () => context.push('/main/product/${article['id']}'),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
