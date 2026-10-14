import 'package:flutter_test/flutter_test.dart';
import 'package:mounaqasa/data/assistant.dart';
import 'package:mounaqasa/data/demo_tenders.dart';
import 'package:mounaqasa/i18n/i18n.dart';
import 'package:mounaqasa/models/alert_prefs.dart';
import 'package:mounaqasa/models/filter.dart';
import 'package:mounaqasa/models/tender.dart';

void main() {
  final now = DateTime(2026, 10, 14, 9);
  final all = demoTenders(now);

  setUpAll(I18n.loadDateSymbols);
  setUp(() => I18n.use('fr'));

  group('normalize', () {
    test('ignore accents, casse et ponctuation', () {
      expect(normalize("Équipement d'ÉCLAIRAGE"), 'equipement d eclairage');
    });
  });

  group('TenderFilter', () {
    test(
      'sans critère : tous les avis ouverts, du plus récent au plus ancien',
      () {
        final r = const TenderFilter().apply(all, '', now);
        expect(r.length, all.where((x) => !x.cancelled).length);
        for (var i = 1; i < r.length; i++) {
          expect(
            r[i - 1].publishedAt.isAfter(r[i].publishedAt) ||
                r[i - 1].publishedAt == r[i].publishedAt,
            isTrue,
          );
        }
      },
    );

    test(
      'mots-clés : tous les mots doivent être présents, accents ignorés',
      () {
        final r = const TenderFilter().apply(all, 'eclairage casablanca', now);
        expect(r.map((x) => x.id), ['t08']);
        expect(
          const TenderFilter().apply(all, 'eclairage agadir', now),
          isEmpty,
        );
      },
    );

    test('catégorie, région et budget se combinent', () {
      final f = const TenderFilter(
        categories: {Category.travaux},
        regions: {'Souss-Massa'},
        budget: Budget.m5to20,
      );
      expect(f.apply(all, '', now).map((x) => x.id), ['t16']);
      expect(f.activeCount, 3);
    });

    test('date limite sous 7 jours, triée par échéance', () {
      final r = const TenderFilter(
        deadline: DeadlineWindow.d7,
        sort: SortBy.deadline,
      ).apply(all, '', now);
      expect(r, isNotEmpty);
      expect(r.every((x) => daysUntil(x.deadline, now) <= 7), isTrue);
      expect(r.first.id, 't16');
    });

    test('les avis clôturés sont exclus', () {
      final later = now.add(const Duration(days: 60));
      expect(const TenderFilter().apply(all, '', later), isEmpty);
    });

    test('cleared garde le tri', () {
      final f = const TenderFilter(
        regions: {'Oriental'},
        sort: SortBy.amount,
      ).cleared();
      expect(f.activeCount, 0);
      expect(f.sort, SortBy.amount);
    });
  });

  group('AlertPrefs', () {
    test('mot-clé et catégorie', () {
      const p = AlertPrefs(
        categories: {Category.fournitures},
        keywords: ['Informatique'],
      );
      final hits = all.where((x) => x.deadline.isAfter(now) && p.matches(x));
      expect(hits.map((x) => x.id), contains('t03'));
      expect(hits.every((x) => x.category == Category.fournitures), isTrue);
    });

    test('aller-retour JSON', () {
      const p = AlertPrefs(
        newTenders: false,
        reminderDays: 7,
        categories: {Category.services},
        regions: {'Oriental'},
        keywords: ['voirie'],
      );
      final back = AlertPrefs.fromJson(p.toJson());
      expect(back.newTenders, isFalse);
      expect(back.reminderDays, 7);
      expect(back.categories, {Category.services});
      expect(back.regions, {'Oriental'});
      expect(back.keywords, ['voirie']);
    });

    test('JSON abîmé : valeurs par défaut', () {
      final p = AlertPrefs.fromJson({'reminderDays': 'x', 'keywords': 3});
      expect(p.reminderDays, 3);
      expect(p.keywords, isEmpty);
      expect(p.categories.length, 3);
    });
  });

  // L'assistant compare à l'heure réelle : avis datés à partir de maintenant.
  group('SearchAssistant', () {
    final a = SearchAssistant(demoTenders());

    test('catégorie et ville', () {
      final r = a.answer('Travaux à Marrakech');
      expect(r.tenders.map((x) => x.id), ['t01']);
    });

    test('échéance proche', () {
      final r = a.answer('services qui clôturent cette semaine');
      expect(r.tenders, isNotEmpty);
      expect(r.tenders.every((x) => x.category == Category.services), isTrue);
      expect(r.tenders.every((x) => daysUntil(x.deadline) <= 7), isTrue);
    });

    test('budget', () {
      final r = a.answer('fournitures de plus de 5 millions');
      expect(r.tenders.map((x) => x.id), ['t18']);
    });

    test('secteur privé', () {
      final r = a.answer('Consultations du secteur privé');
      expect(r.tenders.every((x) => x.isPrivate), isTrue);
      expect(r.tenders.length, 2);
    });

    test('mot-clé libre', () {
      final r = a.answer('panneaux solaires');
      expect(r.tenders.map((x) => x.id), ['t09']);
    });

    test('demande incomprise : pas de résultat inventé', () {
      final r = a.answer('???');
      expect(r.tenders, isEmpty);
      expect(r.text, isNotEmpty);
    });

    test('résumé d\'un avis', () {
      final x = a.tenders.first;
      final r = a.answer('', about: x);
      expect(r.text, contains(x.title));
    });
  });

  group('formats', () {
    test('montants', () {
      expect(fmtMadShort(8460000), '8,5 M MAD');
      expect(fmtMadShort(940000), '940 k MAD');
      expect(fmtMadShort(31800000), '32 M MAD');
    });

    test('tailles', () {
      expect(fmtSize(412), '412 Ko');
      expect(fmtSize(14300), '14 Mo');
      expect(fmtSize(2310), '2,3 Mo');
    });
  });
}
