import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mounaqasa/data/tender_repository.dart';
import 'package:mounaqasa/i18n/i18n.dart';
import 'package:mounaqasa/main.dart';
import 'package:mounaqasa/push/device_sync.dart';
import 'package:mounaqasa/push/push_service.dart';
import 'package:mounaqasa/screens/alerts_screen.dart';
import 'package:mounaqasa/screens/tender_detail_screen.dart';
import 'package:mounaqasa/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'polices.dart';

/// Faux service de notifications, piloté par le test.
class FakePush implements PushService {
  FakePush({this.status = PushPermission.granted, this.grantOnRequest = true});

  PushPermission status;
  final bool grantOnRequest;
  int requests = 0;
  PushMessage? launch;
  final opened = StreamController<PushMessage>.broadcast();
  final foreground = StreamController<PushMessage>.broadcast();
  final refresh = StreamController<String>.broadcast();

  @override
  Future<bool> init() async => status != PushPermission.unavailable;
  @override
  Future<PushPermission> permission() async => status;
  @override
  Future<PushPermission> requestPermission() async {
    requests += 1;
    status = grantOnRequest ? PushPermission.granted : PushPermission.denied;
    return status;
  }

  @override
  Future<String?> token() async =>
      status == PushPermission.granted ? 'jeton-fcm-de-test-0123456789' : null;
  @override
  Stream<String> get onTokenRefresh => refresh.stream;
  @override
  Stream<PushMessage> get onForeground => foreground.stream;
  @override
  Stream<PushMessage> get onOpened => opened.stream;
  @override
  Future<PushMessage?> launchMessage() async => launch;
  @override
  String get platform => 'android';
}

/// Faux serveur : liste d'avis réelle (contrat) et inscriptions enregistrées.
class FakeServer {
  final List<http.Request> devices = [];
  bool failDevices = false;

  late final client = MockClient((req) async {
    if (req.url.path == '/api/devices') {
      devices.add(req);
      return http.Response('', failDevices ? 503 : 204);
    }
    return http.Response.bytes(
      File('test/fixtures/api_tenders.json').readAsBytesSync(),
      200,
    );
  });

  Map<String, dynamic> lastBody() =>
      jsonDecode(devices.last.body) as Map<String, dynamic>;
}

void main() {
  setUpAll(() async {
    await chargerPolices();
    await I18n.loadDateSymbols();
  });

  Future<AppState> pumpApp(
    WidgetTester tester, {
    required FakePush push,
    required FakeServer server,
    String lang = 'fr',
    Map<String, Object> prefs = const {},
  }) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'lang': lang,
      'onboarded': true,
      ...prefs,
    });
    I18n.use(lang);
    final state = AppState(
      repository: ApiTenderRepository(
        'https://api.test',
        client: server.client,
      ),
      push: push,
      deviceSync: DeviceSync('https://api.test', client: server.client),
    );
    await state.load();
    await tester.pumpWidget(TendersApp(state: state));
    await tester.pumpAndSettle();
    return state;
  }

  testWidgets('autorisation déjà donnée : inscription au lancement', (
    tester,
  ) async {
    final server = FakeServer();
    final state = await pumpApp(
      tester,
      push: FakePush(),
      server: server,
      lang: 'ar',
      prefs: {
        'saved': ['o8p:1041301'],
        'alerts': jsonEncode({
          'categories': ['travaux'],
          'keywords': ['voirie'],
          'regions': ['Souss-Massa'],
          'reminderDays': 7,
        }),
      },
    );
    expect(state.pushPermission, PushPermission.granted);
    expect(state.pushRegistered, isTrue);
    expect(server.devices.single.method, 'POST');
    final body = server.lastBody();
    expect(body['token'], 'jeton-fcm-de-test-0123456789');
    expect(body['platform'], 'android');
    expect(body['lang'], 'ar');
    expect(body['saved'], ['o8p:1041301']);
    expect(body['prefs']['categories'], ['travaux']);
    expect(body['prefs']['keywords'], ['voirie']);
    expect(body['prefs']['regions'], ['Souss-Massa']);
    expect(body['prefs']['reminderDays'], 7);
  });

  testWidgets(
    'pas encore autorisé : rien au lancement, demande à l\'enregistrement',
    (tester) async {
      final server = FakeServer();
      final push = FakePush(status: PushPermission.notDetermined);
      await pumpApp(tester, push: push, server: server);
      expect(server.devices, isEmpty);
      expect(push.requests, 0);

      await tester.tap(find.byTooltip(t('Alertes')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          t(
            "À l'enregistrement, le téléphone vous demandera d'autoriser les notifications.",
          ),
        ),
        findsOneWidget,
      );
      await tester.tap(find.text(t('Enregistrer mes alertes')));
      await tester.pumpAndSettle();
      expect(push.requests, 1);
      expect(server.devices.single.method, 'POST');
      expect(
        find.text(
          t('Alertes enregistrées : vous serez prévenu sur ce téléphone.'),
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('autorisation refusée : alertes gardées, message clair', (
    tester,
  ) async {
    final server = FakeServer();
    final push = FakePush(
      status: PushPermission.notDetermined,
      grantOnRequest: false,
    );
    await pumpApp(tester, push: push, server: server);
    await tester.tap(find.byTooltip(t('Alertes')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(t('Enregistrer mes alertes')));
    await tester.pumpAndSettle();
    expect(server.devices, isEmpty);
    expect(
      find.text(
        t(
          'Alertes enregistrées, mais les notifications sont bloquées dans les réglages du téléphone.',
        ),
      ),
      findsOneWidget,
    );
    await tester.tap(find.byTooltip(t('Alertes')));
    await tester.pumpAndSettle();
    expect(
      find.text(
        t(
          'Notifications bloquées : autorisez-les dans les réglages du téléphone pour recevoir vos alertes.',
        ),
      ),
      findsOneWidget,
    );
  });

  testWidgets('alertes coupées : le téléphone est désinscrit', (tester) async {
    final server = FakeServer();
    await pumpApp(tester, push: FakePush(), server: server);
    await tester.tap(find.byTooltip(t('Alertes')));
    await tester.pumpAndSettle();
    final switches = find.descendant(
      of: find.byType(AlertsScreen),
      matching: find.byType(Switch),
    );
    await tester.tap(switches.at(0));
    await tester.pump();
    await tester.tap(switches.at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.text(t('Enregistrer mes alertes')));
    await tester.pumpAndSettle();
    expect(server.devices.last.method, 'DELETE');
    expect(jsonDecode(server.devices.last.body), {
      'token': 'jeton-fcm-de-test-0123456789',
    });
  });

  testWidgets(
    'avis enregistré : rappels mis à jour sur le serveur, regroupés',
    (tester) async {
      final server = FakeServer();
      final state = await pumpApp(tester, push: FakePush(), server: server);
      server.devices.clear();
      state.toggleSaved('o8p:1041301');
      state.toggleSaved('q9t:1038578');
      await tester.pump(const Duration(milliseconds: 500));
      expect(server.devices, isEmpty, reason: 'attente de 2 s');
      await tester.pump(const Duration(seconds: 3));
      expect(server.devices, hasLength(1));
      expect(
        server.lastBody()['saved'],
        containsAll(['o8p:1041301', 'q9t:1038578']),
      );
    },
  );

  testWidgets('notification touchée : fiche de l\'avis', (tester) async {
    final push = FakePush();
    await pumpApp(tester, push: push, server: FakeServer());
    push.opened.add(const PushMessage(tenderId: 'g3h:1034700'));
    await tester.pumpAndSettle();
    expect(find.byType(TenderDetailScreen), findsOneWidget);
    expect(find.text('074/2026/AS'), findsWidgets);
  });

  testWidgets('app lancée par une notification : fiche ouverte', (
    tester,
  ) async {
    final push = FakePush()
      ..launch = const PushMessage(tenderId: 'q9t:1038578');
    await pumpApp(tester, push: push, server: FakeServer());
    await tester.pumpAndSettle();
    expect(find.byType(TenderDetailScreen), findsOneWidget);
    expect(find.text('59/2026/2'), findsWidgets);
  });

  testWidgets('notification reçue app ouverte : bandeau « Voir »', (
    tester,
  ) async {
    final push = FakePush();
    await pumpApp(tester, push: push, server: FakeServer());
    push.foreground.add(
      const PushMessage(
        title: "Nouvel appel d'offres",
        body: 'Travaux · Sidi Kacem',
        tenderId: 'o8p:1041301',
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Sidi Kacem'), findsWidgets);
    await tester.tap(find.text(t('Voir')));
    await tester.pumpAndSettle();
    expect(find.byType(TenderDetailScreen), findsOneWidget);
  });

  testWidgets('serveur injoignable à l\'inscription : signalé, sans bloquer', (
    tester,
  ) async {
    final server = FakeServer()..failDevices = true;
    final state = await pumpApp(tester, push: FakePush(), server: server);
    expect(state.pushRegistered, isFalse);
    expect(state.pushError, isNotNull);
    await tester.tap(find.byTooltip(t('Alertes')));
    await tester.pumpAndSettle();
    expect(
      find.text(
        t(
          "Inscription au serveur impossible pour l'instant : nouvel essai au prochain changement.",
        ),
      ),
      findsOneWidget,
    );
  });

  testWidgets('mode démonstration : aucune demande, carte explicative', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({'onboarded': true});
    I18n.use('fr');
    final push = FakePush();
    final state = AppState(push: push);
    await state.load();
    await tester.pumpWidget(TendersApp(state: state));
    await tester.pumpAndSettle();
    expect(state.pushPermission, PushPermission.unavailable);
    await tester.tap(find.byTooltip(t('Alertes')));
    await tester.pumpAndSettle();
    expect(
      find.textContaining(
        t(
          'Mode démonstration : les alertes ne sont pas envoyées.',
        ).split(' :').first,
      ),
      findsOneWidget,
    );
    await tester.tap(find.text(t('Enregistrer mes alertes')));
    await tester.pumpAndSettle();
    expect(push.requests, 0);
  });
}
