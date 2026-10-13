// Génère les captures d'écran de `captures/` à partir de l'app réelle :
//
//   flutter test --update-goldens tool/captures_test.dart
//
// Hors de `test/` : ce n'est pas un test, seulement un moyen de montrer l'app.
// ignore_for_file: invalid_use_of_visible_for_testing_member
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mounaqasa/i18n/i18n.dart';
import 'package:mounaqasa/main.dart';
import 'package:mounaqasa/screens/alerts_screen.dart';
import 'package:mounaqasa/screens/assistant_screen.dart';
import 'package:mounaqasa/screens/filters_screen.dart';
import 'package:mounaqasa/screens/tender_detail_screen.dart';
import 'package:mounaqasa/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../test/polices.dart';

void main() {
  setUpAll(() async {
    await chargerPolices();
    await I18n.loadDateSymbols();
    // Les icônes Material ne sont pas chargées par défaut dans les tests.
    final sdk =
        Platform.environment['FLUTTER_ROOT'] ??
        File(
          Platform.resolvedExecutable,
        ).parent.parent.parent.parent.parent.parent.path;
    final file = File(
      '$sdk/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
    );
    final icons = FontLoader('MaterialIcons')
      ..addFont(Future.value(ByteData.sublistView(file.readAsBytesSync())));
    await icons.load();
  });

  Future<(AppState, NavigatorState)> open(
    WidgetTester tester, {
    String lang = 'fr',
    bool onboarded = true,
    Map<String, Object> prefs = const {},
  }) async {
    tester.view.physicalSize = const Size(390 * 2, 844 * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'lang': lang,
      'onboarded': onboarded,
      ...prefs,
    });
    final state = AppState();
    await state.load();
    await tester.pumpWidget(TendersApp(state: state));
    await tester.pumpAndSettle();
    final nav = tester.state<NavigatorState>(find.byType(Navigator).first);
    return (state, nav);
  }

  Future<void> shot(String name) => expectLater(
    find.byType(TendersApp),
    matchesGoldenFile('../captures/$name.png'),
  );

  testWidgets('1 bienvenue', (tester) async {
    await open(tester, onboarded: false);
    await shot('1-bienvenue');
  });

  testWidgets('2 accueil', (tester) async {
    await open(
      tester,
      prefs: {
        'saved': ['t01', 't03'],
      },
    );
    await shot('2-accueil');
  });

  testWidgets('3 fiche', (tester) async {
    final (_, nav) = await open(tester);
    nav.push(TenderDetailScreen.route('t01'));
    await tester.pumpAndSettle();
    await shot('3-fiche');
    await tester.drag(find.byType(ListView).last, const Offset(0, -640));
    await tester.pumpAndSettle();
    await shot('4-fiche-suite');
  });

  testWidgets('5 filtres', (tester) async {
    final (state, nav) = await open(tester);
    nav.push(FiltersScreen.route());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sous 15 jours'));
    await tester.tap(find.text('Services'));
    await tester.pumpAndSettle();
    await shot('5-filtres');
  });

  testWidgets('6 alertes', (tester) async {
    final (_, nav) = await open(
      tester,
      prefs: {
        'alerts':
            '{"keywords":["voirie","informatique","solaire"],"regions":["Souss-Massa","Marrakech-Safi"]}',
      },
    );
    nav.push(AlertsScreen.route());
    await tester.pumpAndSettle();
    await shot('6-alertes');
  });

  testWidgets('7 assistant', (tester) async {
    final (_, nav) = await open(tester);
    nav.push(AssistantScreen.route());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Services qui clôturent cette semaine'));
    await tester.pumpAndSettle();
    await shot('7-assistant');
  });

  testWidgets('8 hors ligne', (tester) async {
    final now = DateTime.now();
    await open(
      tester,
      prefs: {
        'downloads':
            '{"t01":"${now.subtract(const Duration(hours: 2)).toIso8601String()}",'
            '"t03":"${now.subtract(const Duration(days: 1)).toIso8601String()}",'
            '"t08":"${now.subtract(const Duration(days: 3)).toIso8601String()}"}',
      },
    );
    await tester.tap(find.text('Hors ligne'));
    await tester.pumpAndSettle();
    await shot('8-hors-ligne');
  });

  testWidgets('9 accueil arabe', (tester) async {
    await open(tester, lang: 'ar');
    await shot('9-accueil-ar');
  });

  testWidgets('10 fiche arabe', (tester) async {
    final (_, nav) = await open(tester, lang: 'ar');
    nav.push(TenderDetailScreen.route('t03'));
    await tester.pumpAndSettle();
    await shot('10-fiche-ar');
  });
}
