import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mounaqasa/ai/ai_summary.dart';
import 'package:mounaqasa/data/tender_repository.dart';
import 'package:mounaqasa/i18n/i18n.dart';
import 'package:mounaqasa/main.dart';
import 'package:mounaqasa/screens/tender_detail_screen.dart';
import 'package:mounaqasa/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'polices.dart';

/// Réponse de `GET /api/tenders/:id/summary` (forme produite par tenders_api).
const _summary = {
  'id': 'o8p:1041301',
  'fr': {
    'headline': 'Construire des routes rurales autour de Sidi Kacem.',
    'points': [
      'Budget estimé : 21 446 884 MAD.',
      'Caution provisoire : 428 000 MAD.',
    ],
    'attention': ['Qualification B exigée.'],
    'forWhom': 'Entreprises de travaux routiers classées B.',
  },
  'ar': {
    'headline': 'بناء طرق قروية حول سيدي قاسم.',
    'points': ['الميزانية التقديرية: 21 446 884 MAD.'],
    'attention': [],
    'forWhom': '',
  },
  'model': 'claude-opus-5-5',
};

/// Faux serveur : liste réelle (contrat) et résumé, avec un délai réglable.
MockClient _server({
  int summaryStatus = 200,
  Completer<void>? gate,
  List<Uri>? calls,
}) => MockClient((req) async {
  if (req.url.path.endsWith('/summary')) {
    calls?.add(req.url);
    if (gate != null) await gate.future;
    return http.Response.bytes(
      utf8.encode(jsonEncode(summaryStatus == 200 ? _summary : {'error': 'x'})),
      summaryStatus,
    );
  }
  return http.Response.bytes(
    File('test/fixtures/api_tenders.json').readAsBytesSync(),
    200,
  );
});

/// Liste défilante de la fiche (et non celle de l'accueil, restée dessous). Un
/// getter : un Finder garde ses résultats, il en faut un neuf par test.
Finder get _detailScrollable => find
    .descendant(
      of: find.byType(TenderDetailScreen),
      matching: find.byType(Scrollable),
    )
    .first;

void main() {
  setUpAll(() async {
    await chargerPolices();
    await I18n.loadDateSymbols();
  });

  Future<AppState> openDetail(
    WidgetTester tester,
    MockClient client, {
    String lang = 'fr',
    bool settle = true,
  }) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({'lang': lang, 'onboarded': true});
    I18n.use(lang);
    final state = AppState(
      repository: ApiTenderRepository('https://api.test', client: client),
      summaryApi: AiSummaryApi('https://api.test', client: client),
    );
    await state.load();
    await tester.pumpWidget(TendersApp(state: state));
    await tester.pumpAndSettle();
    final nav = tester.state<NavigatorState>(find.byType(Navigator).first);
    nav.push(TenderDetailScreen.route('o8p:1041301'));
    if (settle) {
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byIcon(Icons.auto_awesome),
        200,
        scrollable: _detailScrollable,
      );
      await tester.pumpAndSettle();
    }
    return state;
  }

  testWidgets('résumé IA affiché dans la fiche', (tester) async {
    final calls = <Uri>[];
    await openDetail(tester, _server(calls: calls));
    expect(find.text(t('Résumé IA')), findsOneWidget);
    expect(
      find.text('Construire des routes rurales autour de Sidi Kacem.'),
      findsOneWidget,
    );
    expect(find.text('Qualification B exigée.'), findsOneWidget);
    expect(
      find.text('Entreprises de travaux routiers classées B.'),
      findsOneWidget,
    );
    expect(calls.single.path, '/api/tenders/o8p%3A1041301/summary');
  });

  testWidgets('résumé IA en arabe', (tester) async {
    await openDetail(tester, _server(), lang: 'ar');
    expect(find.text(t('Résumé IA')), findsOneWidget);
    expect(find.text('بناء طرق قروية حول سيدي قاسم.'), findsOneWidget);
  });

  testWidgets('pendant la rédaction : indication, puis le résumé', (
    tester,
  ) async {
    final gate = Completer<void>();
    await openDetail(tester, _server(gate: gate), settle: false);
    // L'indicateur tourne : pas de pumpAndSettle tant que le résumé n'est pas arrivé.
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.drag(_detailScrollable, const Offset(0, -500));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text(t("L'IA lit l'avis…")), findsOneWidget);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text(t('Résumé IA')), findsOneWidget);
  });

  testWidgets('IA indisponible : résumé automatique de l\'app', (tester) async {
    for (final status in [503, 429, 422]) {
      await openDetail(tester, _server(summaryStatus: status));
      expect(find.text(t('Résumé IA')), findsNothing);
      expect(find.text(t('En bref')), findsOneWidget);
      expect(
        find.text(
          t('Résumé automatique : vérifiez toujours le dossier officiel.'),
        ),
        findsOneWidget,
      );
    }
  });

  testWidgets('un seul appel par avis pendant la session', (tester) async {
    final calls = <Uri>[];
    final state = await openDetail(tester, _server(calls: calls));
    await state.aiSummary('o8p:1041301');
    await state.aiSummary('o8p:1041301');
    expect(calls, hasLength(1));
  });

  test('résumé incomplet ignoré', () {
    expect(
      AiSummary.fromJson({
        'headline': '',
        'points': ['a'],
      }),
      isNull,
    );
    expect(AiSummary.fromJson({'headline': 'x', 'points': []}), isNull);
    expect(AiSummary.fromJson('x'), isNull);
    expect(
      AiSummary.fromJson({
        'headline': 'x',
        'points': ['a', 3, ' '],
      })!.points,
      ['a'],
    );
  });
}
