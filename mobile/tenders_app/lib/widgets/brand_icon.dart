import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Pictogramme de SAFA9AT : un avis (feuille au coin plié) sous une loupe corail, sur
/// un fond bleu Majorelle orné d'une étoile à huit branches (khatam).
///
/// Une seule source pour le logo de l'app ([AppLogo]) et pour les icônes du lanceur,
/// générées par `tool/icon/icons_test.dart`.
class BrandIconPainter extends CustomPainter {
  /// Fond en dégradé ; sinon transparent (calque avant des icônes adaptatives).
  final bool background;

  /// Pictogramme dessiné par-dessus le fond.
  final bool glyph;

  /// Pictogramme d'une seule couleur, blanc (icônes à thème d'Android 13).
  final bool monochrome;

  /// Arrondi des coins, en fraction du côté (0 = carré plein).
  final double corner;

  /// Taille du pictogramme : 1 remplit environ les deux tiers de l'icône.
  final double scale;

  const BrandIconPainter({
    this.background = true,
    this.glyph = true,
    this.monochrome = false,
    this.corner = 0.3,
    this.scale = 1,
  });

  static const coral = Color(0xFFFF7A50);
  static const _sheetLine = Color(0xFFCDD2F7);
  static const _fold = Color(0xFFD9DDFA);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    final rect = Offset.zero & Size(s, s);
    if (background) {
      final shape = RRect.fromRectAndRadius(rect, Radius.circular(s * corner));
      canvas.save();
      canvas.clipRRect(shape);
      canvas.drawRect(
        rect,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [K.logoStart, K.primaryDark],
          ).createShader(rect),
      );
      _khatam(canvas, s);
      canvas.restore();
    }
    if (glyph) _glyph(canvas, s);
  }

  /// Étoile à huit branches, discrète, centrée derrière le pictogramme.
  void _khatam(Canvas canvas, double s) {
    final c = Offset(s / 2, s / 2);
    final r = s * 0.43;
    final star = Path();
    for (var i = 0; i < 16; i++) {
      final a = -math.pi / 2 + i * math.pi / 8;
      final d = i.isEven ? r : r * 0.77;
      final p = c + Offset(math.cos(a) * d, math.sin(a) * d);
      i == 0 ? star.moveTo(p.dx, p.dy) : star.lineTo(p.dx, p.dy);
    }
    star.close();
    canvas.drawPath(
      star,
      Paint()..color = Colors.white.withValues(alpha: 0.06),
    );
    canvas.drawPath(
      star,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.10)
        ..style = PaintingStyle.stroke
        ..strokeWidth = s * 0.012
        ..strokeJoin = StrokeJoin.round,
    );
  }

  /// Le pictogramme est dessiné dans un repère de 1024 × 1024, puis centré et mis à
  /// l'échelle.
  void _glyph(Canvas canvas, double s) {
    final k = s / 1024 * scale;
    canvas.save();
    canvas.translate(s / 2, s / 2);
    canvas.scale(k);
    // Centre de la composition (feuille + loupe) dans le repère 1024.
    canvas.translate(-566, -537);
    canvas.saveLayer(const Rect.fromLTWH(-200, -200, 1424, 1424), Paint());

    final white = Paint()..color = Colors.white;
    final sheet = Path()
      ..moveTo(306, 196)
      ..lineTo(498, 196)
      ..lineTo(602, 300)
      ..lineTo(602, 622)
      ..arcToPoint(const Offset(558, 666), radius: const Radius.circular(44))
      ..lineTo(306, 666)
      ..arcToPoint(const Offset(262, 622), radius: const Radius.circular(44))
      ..lineTo(262, 240)
      ..arcToPoint(const Offset(306, 196), radius: const Radius.circular(44))
      ..close();
    canvas.drawPath(sheet, white);

    final clear = Paint()..blendMode = BlendMode.clear;
    Paint line(Color c, double w) => monochrome
        ? (Paint()
            ..blendMode = BlendMode.clear
            ..strokeWidth = w
            ..strokeCap = StrokeCap.round)
        : (Paint()
            ..color = c
            ..strokeWidth = w
            ..strokeCap = StrokeCap.round);

    // Coin plié.
    final fold = Path()
      ..moveTo(498, 196)
      ..lineTo(498, 272)
      ..arcToPoint(
        const Offset(526, 300),
        radius: const Radius.circular(28),
        clockwise: false,
      )
      ..lineTo(602, 300)
      ..close();
    canvas.drawPath(fold, monochrome ? clear : (Paint()..color = _fold));

    // Titre et lignes de l'avis.
    canvas.drawLine(
      const Offset(322, 296),
      const Offset(430, 296),
      line(K.primary, 34),
    );
    final l = line(_sheetLine, 24);
    canvas.drawLine(const Offset(322, 382), const Offset(542, 382), l);
    canvas.drawLine(const Offset(322, 452), const Offset(542, 452), l);
    canvas.drawLine(const Offset(322, 522), const Offset(452, 522), l);

    // Loupe : un liseré transparent la détache de la feuille.
    const center = Offset(632, 640);
    const r = 128.0;
    final handleStart = center + const Offset(118, 118);
    const handleEnd = Offset(836, 844);
    final gap = Paint()
      ..blendMode = BlendMode.clear
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    // Seulement à l'extérieur de l'anneau : la feuille reste visible sous la loupe.
    canvas.drawCircle(center, r + 24, gap..strokeWidth = 48);
    canvas.drawLine(handleStart, handleEnd, gap..strokeWidth = 66 + 44);

    final ring = Paint()
      ..color = monochrome ? Colors.white : coral
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    if (!monochrome) {
      canvas.drawCircle(
        center,
        r - 26,
        Paint()..color = Colors.white.withValues(alpha: 0.16),
      );
    }
    canvas.drawCircle(center, r, ring..strokeWidth = 52);
    canvas.drawLine(handleStart, handleEnd, ring..strokeWidth = 66);

    canvas.restore();
    canvas.restore();
  }

  @override
  bool shouldRepaint(BrandIconPainter old) =>
      old.background != background ||
      old.glyph != glyph ||
      old.monochrome != monochrome ||
      old.corner != corner ||
      old.scale != scale;
}
