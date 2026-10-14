import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mounaqasa/data/tender_repository.dart';
import 'package:mounaqasa/i18n/i18n.dart';
import 'package:mounaqasa/main.dart';
import 'package:mounaqasa/models/tender.dart';
import 'package:mounaqasa/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'polices.dart';

/// Avis tels que les renvoie `tenders_api` (champs relevés sur de vraies fiches).
final _items = [
  {
    'id': 'o8p:1041301',
    'reference': 'SK04/2026/CFR',
    'title':
        'PPCI-Travaux de construction de la RNC reliant la RR418 à la coopérative Bir Anzarane',
    'buyer':
        "LE DIRECTEUR PROVINCIAL DE L'EQUIPEMENT ET DU TRANSPORT ET DE LA LOGISTIQUE DE SIDI KACEM",
    'procedure': "Appel d'offres ouvert",
    'category': 'travaux',
    'publishedAt': '2026-09-20T00:00:00+01:00',
    'deadline': '2099-11-20T13:00:00+01:00',
    'place': 'SIDI KACEM',
    'city': 'Sidi Kacem',
    'region': 'Rabat-Salé-Kénitra',
    'estimate': 21446884.14,
    'deposit': 428000,
    'siteVisit': null,
    'lotsCount': null,
    'qualifications': [
      'Equipement / B- Travaux routiers et voirie urbaine / B.1- Travaux de terrassements routiers courants / Classe 2',
    ],
    'dceSizeKb': 690,
    'portalUrl':
        'https://www.marchespublics.gov.ma/index.php?page=entreprise.EntrepriseDetailConsultation&refConsultation=1041301&orgAcronyme=o8p',
    'detailsAvailable': true,
  },
  {
    'id': 'q9t:1038578',
    'reference': '59/2026/2',
    'title':
        'Achat du matériel médico-technique destiné au Nouvel Hôpital Dakhla',
    'buyer': 'DIRECTEUR DES EQUIPEMENTS ET DE MAINTENANCE RABAT',
    'procedure': "Appel d'offres ouvert",
    'category': 'fournitures',
    'publishedAt': '2026-09-22T00:00:00+01:00',
    'deadline': '2099-11-12T10:00:00+01:00',
    'city': 'Dakhla',
    'region': 'Dakhla-Oued Ed-Dahab',
    'estimate': null,
    'deposit': null,
    'lotsCount': 3,
    'qualifications': [],
    'dceSizeKb': 3052,
    'portalUrl':
        'https://www.marchespublics.gov.ma/index.php?page=entreprise.EntrepriseDetailConsultation&refConsultation=1038578&orgAcronyme=q9t',
  },
  // Incomplet : ignoré sans perdre les autres.
  {'id': '', 'title': 'sans identifiant'},
];

/// Faux serveur : renvoie les avis par tranches de `limit`, ou une panne.
MockClient _server({bool down = false, List<Uri>? calls}) =>
    MockClient((req) async {
      calls?.add(req.url);
      if (down) throw http.ClientException('connexion refusée');
      final limit = int.parse(req.url.queryParameters['limit']!);
      final offset = int.parse(req.url.queryParameters['offset']!);
      final page = _items.skip(offset).take(limit).toList();
      return http.Response.bytes(
        utf8.encode(jsonEncode({'total': _items.length, 'items': page})),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

void main() {
  setUpAll(() async {
    await chargerPolices();
    await I18n.loadDateSymbols();
  });
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    I18n.use('fr');
  });

  test('contrat : la vraie réponse de tenders_api se lit sans perte', () {
    // Produite par `node scripts/contract.js` à partir de pages réelles du portail.
    final body =
        jsonDecode(File('test/fixtures/api_tenders.json').readAsStringSync())
            as Map<String, dynamic>;
    final items = (body['items'] as List).cast<Map<String, dynamic>>();
    final tenders = items.map(Tender.fromJson).toList();
    expect(tenders, hasLength(body['total']));
    for (final x in tenders) {
      expect(x.reference, isNotEmpty);
      expect(x.title, isNotEmpty);
      expect(x.buyer, isNotEmpty);
      expect(x.portalUrl, startsWith('https://www.marchespublics.gov.ma/'));
      expect(x.region, isNotEmpty, reason: x.city);
    }
    final sk = tenders.firstWhere((x) => x.reference == 'SK04/2026/CFR');
    expect(sk.estimate, 21446884.14);
    expect(sk.deposit, 428000);
    expect(sk.qualifications, isNotEmpty);
    expect(sk.deadline.toUtc(), DateTime.utc(2026, 11, 20, 12));
    final dakhla = tenders.firstWhere((x) => x.reference == '59/2026/2');
    expect(dakhla.lotTotal, 3);
    expect(dakhla.category, Category.fournitures);
    final visit = tenders.firstWhere((x) => x.reference == '074/2026/AS');
    expect(visit.siteVisit!.toUtc(), DateTime.utc(2026, 10, 20, 9));
  });

  group('ApiTenderRepository', () {
    test('lit toutes les pages et ignore les avis incomplets', () async {
      final calls = <Uri>[];
      final repo = ApiTenderRepository(
        'https://api.test',
        client: _server(calls: calls),
        pageSize: 2,
      );
      final feed = await repo.fetch();
      expect(feed.fromCache, isFalse);
      expect(feed.tenders.map((x) => x.id), ['o8p:1041301', 'q9t:1038578']);
      expect(calls.length, 2);
      expect(calls.first.path, '/api/tenders');
      expect(calls.first.queryParameters['status'], 'open');
      expect(calls.last.queryParameters['offset'], '2');

      final x = feed.tenders.first;
      expect(x.category, Category.travaux);
      expect(x.estimate, 21446884.14);
      expect(x.deposit, 428000);
      expect(x.executionDelay, isNull);
      expect(x.qualifications, hasLength(1));
      expect(x.dossierSizeKb, 690);
      expect(x.portalUrl, contains('refConsultation=1041301'));
      expect(feed.tenders.last.lotTotal, 3);
    });

    test('serveur injoignable : dernière liste enregistrée', () async {
      await ApiTenderRepository('https://api.test', client: _server()).fetch();
      final feed = await ApiTenderRepository(
        'https://api.test',
        client: _server(down: true),
      ).fetch();
      expect(feed.fromCache, isTrue);
      expect(feed.tenders, hasLength(2));
    });

    test('serveur injoignable sans liste enregistrée : erreur', () async {
      final repo = ApiTenderRepository(
        'https://api.test',
        client: _server(down: true),
      );
      await expectLater(repo.fetch(), throwsA(isA<TenderFetchException>()));
    });
  });

  for (final lang in ['fr', 'ar']) {
    group('app branchée sur l\'API ($lang)', () {
      Future<AppState> pump(WidgetTester tester, {bool down = false}) async {
        tester.view.physicalSize = const Size(390 * 3, 844 * 3);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        SharedPreferences.setMockInitialValues({
          'lang': lang,
          'onboarded': true,
        });
        final state = AppState(
          repository: ApiTenderRepository(
            'https://api.test',
            client: _server(down: down),
          ),
        );
        await state.load();
        await tester.pumpWidget(TendersApp(state: state));
        await tester.pumpAndSettle();
        return state;
      }

      testWidgets('avis réels, source affichée, fiche avec lien officiel', (
        tester,
      ) async {
        final state = await pump(tester);
        expect(state.isDemo, isFalse);
        expect(
          find.textContaining(
            t('Données de démonstration : ces avis sont des exemples.'),
          ),
          findsNothing,
        );
        expect(find.textContaining('Sidi Kacem'), findsWidgets);

        final x = state.results.firstWhere((x) => x.id == 'o8p:1041301');
        await tester.scrollUntilVisible(
          find.text(x.title),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.ensureVisible(find.text(x.title));
        await tester.pumpAndSettle();
        await tester.tap(find.text(x.title));
        await tester.pumpAndSettle();

        expect(
          find.text(
            t('Dossier sur le portail officiel ({size})', {
              'size': fmtSize(690),
            }),
          ),
          findsOneWidget,
        );
        await tester.scrollUntilVisible(
          find.text(t('Qualifications exigées')),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text(t('Qualifications exigées')), findsOneWidget);
        expect(find.text(t("Délai d'exécution")), findsNothing);
      });

      testWidgets('serveur injoignable au premier lancement : réessayer', (
        tester,
      ) async {
        final state = await pump(tester, down: true);
        expect(state.loadError, isNotNull);
        expect(find.text(t('Impossible de charger les avis')), findsOneWidget);
        await tester.ensureVisible(find.text(t('Réessayer')));
        await tester.pumpAndSettle();
        await tester.tap(find.text(t('Réessayer')));
        await tester.pumpAndSettle();
        expect(find.text(t('Impossible de charger les avis')), findsOneWidget);
      });
    });
  }
}
