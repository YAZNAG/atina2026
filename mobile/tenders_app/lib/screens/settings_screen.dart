import 'package:flutter/material.dart';

import '../core/config.dart';
import '../i18n/i18n.dart';
import '../state/scope.dart';
import '../theme/theme.dart';
import '../widgets/common.dart';
import 'alerts_screen.dart';

/// Réglages : langue, alertes, données et informations sur l'app.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          t('Réglages'),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Panel(
            child: Row(
              children: [
                const AppLogo(size: 52),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        appName(),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        t('Appels d\'offres publics et privés au Maroc'),
                        style: const TextStyle(fontSize: 12.5, color: K.body),
                      ),
                    ],
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
                SectionTitle(t('Langue')),
                SizedBox(
                  width: double.infinity,
                  child: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'fr', label: Text('Français')),
                      ButtonSegment(value: 'ar', label: Text('العربية')),
                    ],
                    selected: {state.lang},
                    showSelectedIcon: false,
                    onSelectionChanged: (s) =>
                        AppScope.read(context).setLanguage(s.first),
                    style: SegmentedButton.styleFrom(
                      selectedBackgroundColor: K.primary,
                      selectedForegroundColor: Colors.white,
                      side: const BorderSide(color: K.line),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _Row(
                  icon: Icons.notifications_none_rounded,
                  title: t('Alertes'),
                  subtitle: t('{n} avis ouverts correspondent', {
                    'n': state.alertMatches,
                  }),
                  onTap: () => Navigator.of(context).push(AlertsScreen.route()),
                ),
                const Divider(indent: 56),
                _Row(
                  icon: Icons.bookmark_border_rounded,
                  title: t('Enregistrés'),
                  subtitle: t('{n} avis', {'n': state.saved.length}),
                ),
                const Divider(indent: 56),
                _Row(
                  icon: Icons.download_for_offline_outlined,
                  title: t('Dossiers hors ligne'),
                  subtitle: fmtSize(state.downloadsSizeKb),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _Row(
                  icon: Icons.info_outline_rounded,
                  title: t('Source des données'),
                  subtitle: state.isDemo
                      ? t('Exemples de démonstration, en attendant le serveur')
                      : state.syncedAt == null
                      ? t('Portail marocain des marchés publics')
                      : t('Portail marocain des marchés publics · {when}', {
                          'when': agoLabel(state.syncedAt!),
                        }),
                ),
                const Divider(indent: 56),
                _Row(
                  icon: Icons.verified_outlined,
                  title: t('Version'),
                  subtitle: AppConfig.version,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            t(
              "Vérifiez toujours les conditions dans le dossier officiel avant de déposer une offre.",
            ),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: K.muted, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  const _Row({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: K.primarySoft,
          borderRadius: BorderRadius.circular(R.sm),
        ),
        child: Icon(icon, color: K.primary, size: 20),
      ),
      title: Text(
        title,
        style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(fontSize: 12.5, color: K.body),
      ),
      trailing: onTap == null
          ? null
          : const Icon(Icons.chevron_right_rounded, color: K.muted),
    );
  }
}
