// Dessine les icônes de SAFA9AT à partir du logo de l'app (BrandIconPainter) :
//
//   flutter test --update-goldens tool/icon/icons_test.dart
//   python3 tool/icon/make_icons.py
//
// Le premier produit les originaux en 1024 × 1024 dans `tool/icon/`, le second les
// déclinaisons Android, iOS et web.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:safa9at/widgets/brand_icon.dart';

void main() {
  Future<void> render(
    WidgetTester tester,
    String name,
    BrandIconPainter painter,
  ) async {
    tester.view.physicalSize = const Size(1024, 1024);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      Center(
        child: RepaintBoundary(
          child: CustomPaint(size: const Size(1024, 1024), painter: painter),
        ),
      ),
    );
    await expectLater(
      find.byType(RepaintBoundary),
      matchesGoldenFile('$name.png'),
    );
  }

  // iOS et App Store : carré plein, iOS arrondit lui-même les coins.
  testWidgets(
    'pleine',
    (t) => render(t, 'pleine', const BrandIconPainter(corner: 0)),
  );
  // Android avant la version 8, web, Play Store : coins arrondis.
  testWidgets(
    'arrondie',
    (t) => render(t, 'arrondie', const BrandIconPainter(corner: 0.22)),
  );
  // Android 8 et plus : calques séparés, pictogramme dans la zone sûre (66 dp sur 108).
  testWidgets(
    'fond',
    (t) => render(t, 'fond', const BrandIconPainter(corner: 0, glyph: false)),
  );
  testWidgets(
    'avant',
    (t) => render(
      t,
      'avant',
      const BrandIconPainter(background: false, scale: 0.62),
    ),
  );
  testWidgets(
    'monochrome',
    (t) => render(
      t,
      'monochrome',
      const BrandIconPainter(background: false, monochrome: true, scale: 0.62),
    ),
  );
  // Web « maskable » : zone sûre de 80 %.
  testWidgets(
    'masquable',
    (t) =>
        render(t, 'masquable', const BrandIconPainter(corner: 0, scale: 0.78)),
  );
}
