import 'package:flutter/material.dart';

import '../i18n/i18n.dart';
import '../models/filter.dart';
import '../models/tender.dart';
import '../state/scope.dart';
import '../theme/theme.dart';
import '../widgets/common.dart';
import '../widgets/tender_card.dart';
import 'alerts_screen.dart';
import 'filters_screen.dart';

/// Accueil : bandeau vert avec la recherche, chiffres du jour, catégories, puis la
/// liste des avis ouverts.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final TextEditingController _search;

  @override
  void initState() {
    super.initState();
    _search = TextEditingController();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final results = state.results;
    final selected = state.filter.categories.length == 1
        ? state.filter.categories.first
        : null;

    return RefreshIndicator(
      color: K.primary,
      onRefresh: state.refresh,
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _Header(controller: _search)),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SourceBanner(),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      _Stat(
                        value: state.open.length,
                        label: t('Ouverts'),
                        icon: Icons.folder_open_rounded,
                        color: K.primary,
                        onTap: () => state.setFilter(state.filter.cleared()),
                      ),
                      const SizedBox(width: 10),
                      _Stat(
                        value: state.newCount,
                        label: t('Nouveaux 48 h'),
                        icon: Icons.fiber_new_rounded,
                        color: K.services,
                        onTap: () => state.setFilter(
                          state.filter.cleared().copyWith(
                            published: PublishedWindow.h48,
                            sort: SortBy.recent,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      _Stat(
                        value: state.closingSoonCount,
                        label: t('Clôture < 7 j'),
                        icon: Icons.timer_outlined,
                        color: K.coral,
                        onTap: () => state.setFilter(
                          state.filter.cleared().copyWith(
                            deadline: DeadlineWindow.d7,
                            sort: SortBy.deadline,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: SizedBox(
                width: double.infinity,
                child: SegmentedButton<TenderKind?>(
                  segments: [
                    ButtonSegment(value: null, label: Text(t('Tous'))),
                    ButtonSegment(
                      value: TenderKind.ao,
                      label: Text(t("Appels d'offres")),
                    ),
                    ButtonSegment(
                      value: TenderKind.bdc,
                      label: Text(t('Bons de commande')),
                    ),
                  ],
                  selected: {state.filter.kind},
                  showSelectedIcon: false,
                  onSelectionChanged: (s) =>
                      state.setFilter(state.filter.withKind(s.first)),
                  style: SegmentedButton.styleFrom(
                    selectedBackgroundColor: K.ink,
                    selectedForegroundColor: Colors.white,
                    backgroundColor: K.surface,
                    side: const BorderSide(color: K.line),
                    // Police de l'app (Inter ou Noto Sans Arabic selon la langue).
                    textStyle: TextStyle(
                      fontFamily: Theme.of(
                        context,
                      ).textTheme.bodyMedium?.fontFamily,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                    ),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _CategoryChip(
                    label: t('Tous'),
                    icon: Icons.apps_rounded,
                    selected: state.filter.categories.isEmpty,
                    onTap: () => state.setCategory(null),
                  ),
                  for (final c in Category.values)
                    _CategoryChip(
                      label: c.label,
                      icon: c.icon,
                      color: c.color,
                      selected: selected == c,
                      onTap: () => state.setCategory(selected == c ? null : c),
                    ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      switch (state.filter.kind) {
                        TenderKind.bdc => t('{n} bons de commande', {
                          'n': results.length,
                        }),
                        TenderKind.ao =>
                          results.length == 1
                              ? t('1 appel d\'offres')
                              : t('{n} appels d\'offres', {
                                  'n': results.length,
                                }),
                        null => t('{n} avis', {'n': results.length}),
                      },
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  _SortMenu(
                    value: state.filter.sort,
                    onChanged: (s) =>
                        state.setFilter(state.filter.copyWith(sort: s)),
                  ),
                ],
              ),
            ),
          ),
          if (state.loading && state.tenders.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator(color: K.primary)),
            )
          else if (state.tenders.isEmpty && state.loadError != null)
            SliverToBoxAdapter(
              child: Column(
                children: [
                  EmptyState(
                    icon: Icons.cloud_off_rounded,
                    title: t('Impossible de charger les avis'),
                    message: t(
                      'Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.',
                    ),
                  ),
                  TextButton.icon(
                    onPressed: state.refresh,
                    icon: const Icon(Icons.refresh_rounded),
                    label: Text(t('Réessayer')),
                  ),
                ],
              ),
            )
          else if (results.isEmpty)
            SliverToBoxAdapter(
              child: Column(
                children: [
                  EmptyState(
                    icon: Icons.search_off_rounded,
                    title: t('Aucun résultat'),
                    message: t(
                      'Essayez un autre mot-clé ou retirez des filtres.',
                    ),
                  ),
                  TextButton(
                    onPressed: () {
                      _search.clear();
                      state.setQuery('');
                      state.setFilter(state.filter.cleared());
                    },
                    child: Text(t('Tout réinitialiser')),
                  ),
                ],
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              sliver: SliverList.separated(
                itemCount: results.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (_, i) => TenderCard(results[i]),
              ),
            ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final TextEditingController controller;
  const _Header({required this.controller});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final active = state.filter.activeCount;
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [K.headerStart, K.primaryDark],
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(R.xl)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.35),
                      ),
                    ),
                    child: const AppLogo(size: 36),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      appName(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: t('Alertes'),
                    onPressed: () =>
                        Navigator.of(context).push(AlertsScreen.route()),
                    icon: Badge(
                      isLabelVisible: state.newAlertMatches > 0,
                      backgroundColor: K.coral,
                      label: Text('${state.newAlertMatches}'),
                      child: const Icon(
                        Icons.notifications_none_rounded,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Text(
                t('Trouvez votre prochain marché'),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  height: 1.2,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                t('Appels d\'offres publics et privés au Maroc'),
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.8),
                  fontSize: 13.5,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: controller,
                      onChanged: state.setQuery,
                      textInputAction: TextInputAction.search,
                      decoration: InputDecoration(
                        hintText: t('Mot-clé, acheteur, ville, référence…'),
                        hintStyle: const TextStyle(
                          color: K.muted,
                          fontSize: 14,
                        ),
                        prefixIcon: const Icon(
                          Icons.search_rounded,
                          color: K.muted,
                        ),
                        suffixIcon: state.query.isEmpty
                            ? null
                            : IconButton(
                                tooltip: t('Effacer'),
                                icon: const Icon(
                                  Icons.close_rounded,
                                  color: K.muted,
                                ),
                                onPressed: () {
                                  controller.clear();
                                  state.setQuery('');
                                },
                              ),
                        filled: true,
                        fillColor: Colors.white,
                        contentPadding: const EdgeInsets.symmetric(
                          vertical: 14,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(R.md),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(R.md),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(R.md),
                      onTap: () =>
                          Navigator.of(context).push(FiltersScreen.route()),
                      child: SizedBox(
                        width: 50,
                        height: 50,
                        child: Center(
                          child: Badge(
                            isLabelVisible: active > 0,
                            backgroundColor: K.coral,
                            label: Text('$active'),
                            child: Icon(
                              Icons.tune_rounded,
                              color: K.primary,
                              semanticLabel: t('Filtres'),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final int value;
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _Stat({
    required this.value,
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: K.surface,
        borderRadius: BorderRadius.circular(R.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(R.md),
          onTap: onTap,
          child: Ink(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(R.md),
              border: Border.all(color: K.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: color, size: 20),
                const SizedBox(height: 8),
                Text(
                  '$value',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    height: 1,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11.5, color: K.body),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool selected;
  final VoidCallback onTap;
  const _CategoryChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    this.color = K.primary,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: Material(
        color: selected ? K.ink : K.surface,
        shape: StadiumBorder(
          side: BorderSide(color: selected ? K.ink : K.line),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: [
                Icon(icon, size: 16, color: selected ? Colors.white : color),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: selected ? Colors.white : K.ink,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SortMenu extends StatelessWidget {
  final SortBy value;
  final ValueChanged<SortBy> onChanged;
  const _SortMenu({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<SortBy>(
      tooltip: t('Trier'),
      initialValue: value,
      onSelected: onChanged,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(R.md)),
      itemBuilder: (_) => [
        for (final s in SortBy.values)
          PopupMenuItem(value: s, child: Text(s.label)),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.swap_vert_rounded, size: 18, color: K.primary),
            const SizedBox(width: 4),
            Text(
              value.label,
              style: const TextStyle(
                color: K.primary,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
