import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mounaqasa/data/assistant.dart';
import 'package:mounaqasa/data/demo_tenders.dart';
import 'package:mounaqasa/i18n/i18n.dart';
import 'package:mounaqasa/main.dart';
import 'package:mounaqasa/models/alert_prefs.dart';
import 'package:mounaqasa/models/filter.dart';
import 'package:mounaqasa/models/tender.dart';
import 'package:mounaqasa/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'polices.dart';

void main() {
  setUpAll(() async {
    await chargerPolices();
    await I18n.loadDateSymbols();
  });
  setUp(() => I18n.use('fr'));

  test('lecture de l\'API : type, annulation, catégorie inconnue', () {
    final x = Tender.fromJson({
      'id': 'bdc:58231',
      'kind': 'bdc',
      'cancelled': true,
      'reference': 'BC-12/2026',
      'title': 'Carburant',
      'category': null,
      'deadline': '2099-12-31T12:00:00+01:00',
    });
    expect(x.kind, TenderKind.bdc);
    expect(x.isPurchaseOrder, isTrue);
    expect(x.cancelled, isTrue);
    expect(x.isOpen, isFalse);
    expect(x.category, isNull);
    expect(
      Tender.fromJson({'id': 'a', 'deadline': '2099-01-01T00:00:00Z'}).kind,
      TenderKind.ao,
    );
  });

  test('filtre : appels d\'offres, bons de commande, annulés exclus', () {
    final all = demoTenders();
    final bdc = const TenderFilter(kind: TenderKind.bdc).apply(all, '');
    expect(bdc.map((x) => x.id), unorderedEquals(['b01', 'b02', 'b03']));
    final ao = const TenderFilter(kind: TenderKind.ao).apply(all, '');
    expect(ao.every((x) => x.kind == TenderKind.ao), isTrue);
    expect(const TenderFilter().apply(all, '').length, ao.length + bdc.length);
    final f = const TenderFilter(kind: TenderKind.bdc).cleared();
    expect(
      f.kind,
      TenderKind.bdc,
      reason: 'réinitialiser garde le type choisi',
    );
    expect(f.copyWith(sort: SortBy.deadline).kind, TenderKind.bdc);
    expect(f.withKind(null).kind, isNull);
  });

  test('alertes : types suivis, aller-retour JSON', () {
    final all = demoTenders();
    const onlyBdc = AlertPrefs(kinds: {TenderKind.bdc});
    final hits = all.where(onlyBdc.matches);
    expect(hits, isNotEmpty);
    expect(hits.every((x) => x.isPurchaseOrder && !x.cancelled), isTrue);
    final back = AlertPrefs.fromJson(onlyBdc.toJson());
    expect(back.kinds, {TenderKind.bdc});
    expect(onlyBdc.toJson()['kinds'], ['bdc']);
    expect(AlertPrefs.fromJson({}).kinds, {TenderKind.ao, TenderKind.bdc});
  });

  test('assistant : « bons de commande »', () {
    final r = SearchAssistant(demoTenders()).answer('bons de commande à Taza');
    expect(r.tenders.map((x) => x.id), ['b02']);
    final all = SearchAssistant(demoTenders()).answer('bons de commande');
    expect(all.tenders.every((x) => x.isPurchaseOrder), isTrue);
    expect(all.tenders.length, 3);
  });

  for (final lang in ['fr', 'ar']) {
    testWidgets('accueil ($lang) : sélecteur de type et pastille', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(360 * 3, 640 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues({'lang': lang, 'onboarded': true});
      final state = AppState();
      await state.load();
      await tester.pumpWidget(TendersApp(state: state));
      await tester.pumpAndSettle();

      await tester.tap(find.text(t('Bons de commande')));
      await tester.pumpAndSettle();
      expect(state.filter.kind, TenderKind.bdc);
      expect(state.results.length, 3);
      final b02 = state.results.firstWhere((x) => x.id == 'b02');
      await tester.scrollUntilVisible(
        find.text(b02.title),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.text(b02.title));
      await tester.pumpAndSettle();
      expect(find.text(t('Bon de commande')), findsWidgets);
      await tester.tap(find.text(b02.title));
      await tester.pumpAndSettle();
      expect(find.text(t('Date limite de remise des devis')), findsOneWidget);
    });
  }
}
