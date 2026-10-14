import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mounaqasa/i18n/i18n.dart';
import 'package:mounaqasa/main.dart';
import 'package:mounaqasa/screens/alerts_screen.dart';
import 'package:mounaqasa/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'polices.dart';

/// Chaque écran est monté en français et en arabe, sur un grand et un petit téléphone :
/// un débordement de mise en page ou une exception fait échouer le test.
void main() {
  setUpAll(() async {
    await chargerPolices();
    await I18n.loadDateSymbols();
  });

  Future<AppState> pumpApp(
    WidgetTester tester, {
    required String lang,
    required Size size,
    bool onboarded = true,
  }) async {
    tester.view.physicalSize = size * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'lang': lang,
      'onboarded': onboarded,
    });
    final state = AppState();
    await state.load();
    await tester.pumpWidget(TendersApp(state: state));
    await tester.pumpAndSettle();
    return state;
  }

  Future<void> tapTab(WidgetTester tester, String label) async {
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text(t(label)),
      ),
    );
    await tester.pumpAndSettle();
  }

  for (final lang in ['fr', 'ar']) {
    for (final (name, size) in [
      ('grand', const Size(390, 844)),
      ('petit', const Size(360, 640)),
    ]) {
      group('$lang · $name écran', () {
        testWidgets('bienvenue puis accueil', (tester) async {
          await pumpApp(tester, lang: lang, size: size, onboarded: false);
          expect(
            find.text(t('Ne manquez plus aucun marché au Maroc.')),
            findsOneWidget,
          );
          await tester.scrollUntilVisible(find.text(t('Commencer')), 200);
          await tester.tap(find.text(t('Commencer')));
          await tester.pumpAndSettle();
          expect(find.text(t('Trouvez votre prochain marché')), findsOneWidget);
        });

        testWidgets('accueil : sens d\'écriture, recherche et catégories', (
          tester,
        ) async {
          final state = await pumpApp(tester, lang: lang, size: size);
          final dir = Directionality.of(
            tester.element(find.text(t('Trouvez votre prochain marché'))),
          );
          expect(dir, lang == 'ar' ? TextDirection.rtl : TextDirection.ltr);

          await tester.enterText(find.byType(TextField).first, 'éclairage');
          await tester.pumpAndSettle();
          expect(state.results.length, 1);
          expect(find.text(t('{n} avis', {'n': 1})), findsOneWidget);

          await tester.enterText(find.byType(TextField).first, 'zzzz');
          await tester.pumpAndSettle();
          expect(state.results, isEmpty);
          await tester.scrollUntilVisible(
            find.text(t('Aucun résultat')),
            200,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.ensureVisible(find.text(t('Tout réinitialiser')));
          await tester.pumpAndSettle();
          await tester.tap(find.text(t('Tout réinitialiser')));
          await tester.pumpAndSettle();
          expect(state.query, isEmpty);

          // Puce « Tous » des catégories (le sélecteur de type a aussi un « Tous »).
          await tester.scrollUntilVisible(
            find.byIcon(Icons.apps_rounded),
            -300,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.ensureVisible(find.text(t('Fournitures')).first);
          await tester.pumpAndSettle();
          await tester.tap(find.text(t('Fournitures')).first);
          await tester.pumpAndSettle();
          expect(
            state.results.every((x) => x.category?.name == 'fournitures'),
            isTrue,
          );
        });

        testWidgets('fiche : enregistrer et télécharger le dossier', (
          tester,
        ) async {
          final state = await pumpApp(tester, lang: lang, size: size);
          final first = state.results.first;
          await tester.scrollUntilVisible(
            find.text(first.title),
            200,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.ensureVisible(find.text(first.title));
          await tester.pumpAndSettle();
          await tester.tap(find.text(first.title));
          await tester.pumpAndSettle();
          expect(find.text(t('Informations clés')), findsOneWidget);

          await tester.tap(find.byTooltip(t('Enregistrer')));
          await tester.pump();
          expect(state.saved, contains(first.id));

          await tester.tap(find.byIcon(Icons.download_rounded));
          await tester.pump(const Duration(milliseconds: 300));
          expect(state.downloading, contains(first.id));
          await tester.pump(const Duration(seconds: 2));
          await tester.pumpAndSettle();
          expect(state.downloads, contains(first.id));
          expect(find.text(t('Disponible hors ligne')), findsOneWidget);

          await tester.scrollUntilVisible(
            find.text(t("Demander à l'assistant")),
            300,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.ensureVisible(find.text(t("Demander à l'assistant")));
          await tester.pumpAndSettle();
          await tester.tap(find.text(t("Demander à l'assistant")));
          await tester.pumpAndSettle();
          expect(find.textContaining(t("Voici l'essentiel :")), findsOneWidget);
          expect(find.textContaining(first.reference), findsWidgets);
        });

        testWidgets('filtres : appliquer puis réinitialiser', (tester) async {
          final state = await pumpApp(tester, lang: lang, size: size);
          await tester.tap(find.byIcon(Icons.tune_rounded).first);
          await tester.pumpAndSettle();
          expect(find.text(t('Filtres')), findsOneWidget);

          await tester.tap(find.text(t('Sous {n} jours', {'n': 7})));
          await tester.pumpAndSettle();
          await tester.tap(find.byIcon(Icons.check_rounded).last);
          await tester.pumpAndSettle();
          expect(state.filter.activeCount, 1);
          expect(state.results.length, state.closingSoonCount);
        });

        testWidgets('onglets enregistrés, assistant, hors ligne, réglages', (
          tester,
        ) async {
          final state = await pumpApp(tester, lang: lang, size: size);

          await tapTab(tester, 'Enregistrés');
          expect(find.text(t('Aucun avis enregistré')), findsOneWidget);

          await tapTab(tester, 'Assistant');
          expect(find.text(t('Que cherchez-vous ?')), findsOneWidget);
          await tester.tap(find.text(t('Travaux à Marrakech')));
          await tester.pumpAndSettle();
          expect(find.textContaining('Al Massira'), findsOneWidget);

          await tapTab(tester, 'Hors ligne');
          expect(find.text(t('Aucun dossier téléchargé')), findsOneWidget);

          await tapTab(tester, 'Réglages');
          expect(find.text(t('Langue')), findsOneWidget);
          final other = lang == 'fr' ? 'العربية' : 'Français';
          await tester.tap(find.text(other));
          await tester.pumpAndSettle();
          expect(state.lang, lang == 'fr' ? 'ar' : 'fr');
          expect(find.text(t('Langue')), findsOneWidget);
        });

        testWidgets('alertes : mots-clés et enregistrement', (tester) async {
          final state = await pumpApp(tester, lang: lang, size: size);
          await tester.tap(find.byTooltip(t('Alertes')));
          await tester.pumpAndSettle();

          final field = find.descendant(
            of: find.byType(AlertsScreen),
            matching: find.byType(TextField),
          );
          await tester.scrollUntilVisible(
            field,
            200,
            scrollable: find
                .descendant(
                  of: find.byType(AlertsScreen),
                  matching: find.byType(Scrollable),
                )
                .first,
          );
          await tester.ensureVisible(field);
          await tester.pumpAndSettle();
          await tester.enterText(field, 'informatique');
          await tester.tap(find.byTooltip(t('Ajouter')));
          await tester.pumpAndSettle();
          expect(find.text('informatique'), findsOneWidget);

          await tester.tap(find.text(t('Enregistrer mes alertes')));
          await tester.pumpAndSettle();
          expect(state.alerts.keywords, ['informatique']);
          expect(state.alertMatches, greaterThan(0));
        });
      });
    }
  }

  testWidgets('les choix sont gardés d\'un lancement à l\'autre', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({'onboarded': true});
    final first = AppState();
    await first.load();
    first.toggleSaved('t03');
    first.setLanguage('ar');
    await tester.pump();

    final second = AppState();
    await second.load();
    expect(second.saved, {'t03'});
    expect(second.lang, 'ar');
    I18n.use('fr');
  });
}
