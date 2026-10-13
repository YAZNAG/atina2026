import 'package:flutter/material.dart';

import '../i18n/i18n.dart';
import '../state/scope.dart';
import '../theme/theme.dart';
import '../widgets/common.dart';

/// Premier lancement : choix de la langue et ce que fait l'app, en un seul écran.
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final features = [
      (
        Icons.manage_search_rounded,
        t('Tous les avis au même endroit'),
        t('Appels d\'offres publics et privés, mis à jour chaque jour.'),
      ),
      (
        Icons.tune_rounded,
        t('Recherche précise'),
        t('Filtrez par secteur, région, date limite et budget.'),
      ),
      (
        Icons.notifications_active_outlined,
        t('Alertes sur mesure'),
        t('Soyez prévenu dès qu\'un marché vous correspond.'),
      ),
      (
        Icons.download_for_offline_outlined,
        t('Dossiers hors ligne'),
        t('Téléchargez les pièces et consultez-les partout.'),
      ),
    ];

    return Scaffold(
      backgroundColor: K.surface,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          children: [
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'fr', label: Text('FR')),
                  ButtonSegment(value: 'ar', label: Text('ع')),
                ],
                selected: {state.lang},
                showSelectedIcon: false,
                onSelectionChanged: (s) =>
                    AppScope.read(context).setLanguage(s.first),
                style: SegmentedButton.styleFrom(
                  selectedBackgroundColor: K.primary,
                  selectedForegroundColor: Colors.white,
                  side: const BorderSide(color: K.line),
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ),
            const SizedBox(height: 28),
            const Center(child: AppLogo(size: 84)),
            const SizedBox(height: 20),
            Text(
              appName(),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              t('Ne manquez plus aucun marché au Maroc.'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15.5, color: K.body),
            ),
            const SizedBox(height: 32),
            for (final (icon, title, body) in features)
              Padding(
                padding: const EdgeInsets.only(bottom: 18),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: K.primarySoft,
                        borderRadius: BorderRadius.circular(R.md),
                      ),
                      child: Icon(icon, color: K.primary),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            body,
                            style: const TextStyle(
                              color: K.body,
                              height: 1.4,
                              fontSize: 13.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 16),
            PrimaryButton(
              label: t('Commencer'),
              icon: Icons.arrow_forward_rounded,
              onPressed: () => AppScope.read(context).finishOnboarding(),
            ),
          ],
        ),
      ),
    );
  }
}
