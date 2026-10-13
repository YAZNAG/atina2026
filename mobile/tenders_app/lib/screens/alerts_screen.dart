import 'package:flutter/material.dart';

import '../data/demo_tenders.dart';
import '../i18n/i18n.dart';
import '../models/alert_prefs.dart';
import '../models/tender.dart';
import '../state/scope.dart';
import '../theme/theme.dart';
import '../widgets/common.dart';

/// Préférences d'alertes : ce qui doit déclencher une notification. Le compteur en bas
/// montre combien d'avis ouverts correspondent déjà aux critères.
class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (_) => const AlertsScreen());

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  AlertPrefs? _draft;
  final _keyword = TextEditingController();

  @override
  void dispose() {
    _keyword.dispose();
    super.dispose();
  }

  void _addKeyword(AlertPrefs p) {
    final k = _keyword.text.trim();
    if (k.isEmpty) return;
    final exists = p.keywords.any((e) => e.toLowerCase() == k.toLowerCase());
    setState(() {
      if (!exists) _draft = p.copyWith(keywords: [...p.keywords, k]);
      _keyword.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final p = _draft ??= state.alerts;
    final matches = state.open.where(p.matches).length;
    void set(AlertPrefs v) => setState(() => _draft = v);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          t('Alertes'),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionTitle(t('Me prévenir')),
                _SwitchRow(
                  icon: Icons.fiber_new_rounded,
                  title: t('Nouveaux appels d\'offres'),
                  subtitle: t('Dès qu\'un avis correspond à mes critères'),
                  value: p.newTenders,
                  onChanged: (v) => set(p.copyWith(newTenders: v)),
                ),
                const Divider(),
                _SwitchRow(
                  icon: Icons.alarm_rounded,
                  title: t('Rappels de date limite'),
                  subtitle: t('Pour les avis enregistrés'),
                  value: p.deadlineReminders,
                  onChanged: (v) => set(p.copyWith(deadlineReminders: v)),
                ),
                if (p.deadlineReminders) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final d in const [1, 3, 7])
                        ChoiceChip(
                          label: Text(t('{n} j avant', {'n': d})),
                          selected: p.reminderDays == d,
                          onSelected: (_) => set(p.copyWith(reminderDays: d)),
                          selectedColor: K.primarySoft,
                          labelStyle: TextStyle(
                            color: p.reminderDays == d ? K.primary : K.body,
                            fontWeight: FontWeight.w600,
                          ),
                          side: const BorderSide(color: K.line),
                          showCheckmark: false,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionTitle(t('Catégories suivies')),
                for (final c in Category.values)
                  _SwitchRow(
                    icon: c.icon,
                    iconColor: c.color,
                    title: c.label,
                    value: p.categories.contains(c),
                    onChanged: (v) => set(
                      p.copyWith(
                        categories: v
                            ? {...p.categories, c}
                            : ({...p.categories}..remove(c)),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionTitle(t('Mots-clés')),
                Text(
                  t(
                    'Une alerte part si l\'avis contient au moins un de ces mots.',
                  ),
                  style: const TextStyle(fontSize: 12.5, color: K.body),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _keyword,
                        onSubmitted: (_) => _addKeyword(p),
                        decoration: InputDecoration(
                          hintText: t('Ex. : voirie, informatique, solaire'),
                          hintStyle: const TextStyle(
                            color: K.muted,
                            fontSize: 13.5,
                          ),
                          isDense: true,
                          filled: true,
                          fillColor: K.bg,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 13,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(R.md),
                            borderSide: const BorderSide(color: K.line),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(R.md),
                            borderSide: const BorderSide(color: K.line),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      tooltip: t('Ajouter'),
                      style: IconButton.styleFrom(backgroundColor: K.primary),
                      onPressed: () => _addKeyword(p),
                      icon: const Icon(Icons.add_rounded),
                    ),
                  ],
                ),
                if (p.keywords.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final k in p.keywords)
                        InputChip(
                          label: Text(k),
                          onDeleted: () => set(
                            p.copyWith(
                              keywords: p.keywords
                                  .where((e) => e != k)
                                  .toList(),
                            ),
                          ),
                          deleteButtonTooltipMessage: t('Retirer'),
                          backgroundColor: K.primarySoft,
                          side: BorderSide.none,
                          labelStyle: const TextStyle(
                            color: K.primaryDark,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionTitle(t('Régions')),
                Text(
                  p.regions.isEmpty
                      ? t('Tout le Maroc')
                      : t('{n} région(s) sélectionnée(s)', {
                          'n': p.regions.length,
                        }),
                  style: const TextStyle(fontSize: 12.5, color: K.body),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final r in regions)
                      FilterChip(
                        label: Text(r),
                        selected: p.regions.contains(r),
                        onSelected: (v) => set(
                          p.copyWith(
                            regions: v
                                ? {...p.regions, r}
                                : ({...p.regions}..remove(r)),
                          ),
                        ),
                        selectedColor: K.primarySoft,
                        checkmarkColor: K.primary,
                        side: const BorderSide(color: K.line),
                        labelStyle: const TextStyle(fontSize: 12.5),
                      ),
                  ],
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
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  t('{n} avis ouverts correspondent à ces critères', {
                    'n': matches,
                  }),
                  style: const TextStyle(fontSize: 12.5, color: K.body),
                ),
                const SizedBox(height: 10),
                PrimaryButton(
                  icon: Icons.notifications_active_outlined,
                  label: t('Enregistrer mes alertes'),
                  onPressed: () {
                    AppScope.read(context).setAlerts(p);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(t('Alertes enregistrées'))),
                    );
                    Navigator.pop(context);
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _SwitchRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
    this.iconColor = K.primary,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onChanged(!value),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Icon(icon, color: iconColor, size: 21),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      style: const TextStyle(fontSize: 12, color: K.body),
                    ),
                ],
              ),
            ),
            Switch(value: value, onChanged: onChanged),
          ],
        ),
      ),
    );
  }
}
