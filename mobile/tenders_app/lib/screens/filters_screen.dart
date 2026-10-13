import 'package:flutter/material.dart';

import '../data/demo_tenders.dart';
import '../i18n/i18n.dart';
import '../models/filter.dart';
import '../models/tender.dart';
import '../state/scope.dart';
import '../theme/theme.dart';
import '../widgets/common.dart';

/// Recherche avancée. Les choix restent locaux jusqu'à « Afficher » ; le bouton donne
/// en direct le nombre de résultats.
class FiltersScreen extends StatefulWidget {
  const FiltersScreen({super.key});

  static Route<void> route() => MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => const FiltersScreen(),
  );

  @override
  State<FiltersScreen> createState() => _FiltersScreenState();
}

class _FiltersScreenState extends State<FiltersScreen> {
  TenderFilter? _draft;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final f = _draft ??= state.filter;
    final count = f.apply(state.tenders, state.query).length;
    void set(TenderFilter v) => setState(() => _draft = v);

    Set<T> toggle<T>(Set<T> s, T v) =>
        s.contains(v) ? ({...s}..remove(v)) : {...s, v};

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: t('Fermer'),
          icon: const Icon(Icons.close_rounded),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          t('Filtres'),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          TextButton(
            onPressed: f.activeCount == 0 ? null : () => set(f.cleared()),
            child: Text(t('Réinitialiser')),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          _Section(
            title: t('Catégorie'),
            child: Column(
              children: [
                for (final c in Category.values)
                  _ToggleRow(
                    icon: c.icon,
                    color: c.color,
                    label: c.label,
                    value: f.categories.contains(c),
                    onChanged: (_) =>
                        set(f.copyWith(categories: toggle(f.categories, c))),
                  ),
                _ToggleRow(
                  icon: Icons.business_rounded,
                  color: K.body,
                  label: t('Secteur privé uniquement'),
                  value: f.privateOnly,
                  onChanged: (v) => set(f.copyWith(privateOnly: v)),
                ),
              ],
            ),
          ),
          _Section(
            title: t('Date limite'),
            child: _Choices<DeadlineWindow>(
              values: DeadlineWindow.values,
              selected: f.deadline,
              label: (v) => v.label,
              onSelected: (v) => set(f.copyWith(deadline: v)),
            ),
          ),
          _Section(
            title: t('Publication'),
            child: _Choices<PublishedWindow>(
              values: PublishedWindow.values,
              selected: f.published,
              label: (v) => v.label,
              onSelected: (v) => set(f.copyWith(published: v)),
            ),
          ),
          _Section(
            title: t('Montant estimé (MAD)'),
            child: _Choices<Budget>(
              values: Budget.values,
              selected: f.budget,
              label: (v) => v.label,
              onSelected: (v) => set(f.copyWith(budget: v)),
            ),
          ),
          _Section(
            title: t('Procédure'),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final p in procedures)
                  _Chip(
                    label: p,
                    selected: f.procedures.contains(p),
                    onTap: () =>
                        set(f.copyWith(procedures: toggle(f.procedures, p))),
                  ),
              ],
            ),
          ),
          _Section(
            title: t('Région'),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final r in regions)
                  _Chip(
                    label: r,
                    selected: f.regions.contains(r),
                    onTap: () => set(f.copyWith(regions: toggle(f.regions, r))),
                  ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: K.surface,
          border: Border(top: BorderSide(color: K.line)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: PrimaryButton(
              icon: Icons.check_rounded,
              label: count == 1
                  ? t('Afficher 1 résultat')
                  : t('Afficher {n} résultats', {'n': count}),
              onPressed: () {
                AppScope.read(context).setFilter(f);
                Navigator.pop(context);
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final Widget child;
  const _Section({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [SectionTitle(title), child],
        ),
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _ToggleRow({
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onChanged(!value),
      borderRadius: BorderRadius.circular(R.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Icon(icon, size: 20, color: color),
            const SizedBox(width: 12),
            Expanded(
              child: Text(label, style: const TextStyle(fontSize: 14.5)),
            ),
            Switch(value: value, onChanged: onChanged),
          ],
        ),
      ),
    );
  }
}

class _Choices<T> extends StatelessWidget {
  final List<T> values;
  final T selected;
  final String Function(T) label;
  final ValueChanged<T> onSelected;
  const _Choices({
    required this.values,
    required this.selected,
    required this.label,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final v in values)
          _Chip(
            label: label(v),
            selected: v == selected,
            onTap: () => onSelected(v),
          ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? K.primary : K.bg,
      shape: StadiumBorder(
        side: BorderSide(color: selected ? K.primary : K.line),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (selected) ...[
                const Icon(Icons.check_rounded, size: 15, color: Colors.white),
                const SizedBox(width: 5),
              ],
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: selected ? Colors.white : K.body,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
