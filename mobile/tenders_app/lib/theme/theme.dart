import 'package:flutter/material.dart';

import '../i18n/i18n.dart';

/// Charte « bleu Majorelle » : fonds clairs légèrement bleutés, bleu indigo profond pour
/// l'action, corail pour l'urgence, terre cuite, sarcelle et framboise pour les catégories.
class K {
  static const primary = Color(0xFF3341C4);
  static const primaryDark = Color(0xFF1F2780);
  static const primarySoft = Color(0xFFE7E9FB);
  static const primaryTint = Color(0xFFF4F5FE);
  static const ink = Color(0xFF12142B);
  static const body = Color(0xFF4B4F6B);
  static const muted = Color(0xFF8B8FA8);
  static const line = Color(0xFFE5E7F0);
  static const bg = Color(0xFFF5F6FB);
  static const surface = Color(0xFFFFFFFF);
  static const coral = Color(0xFFE0533D);
  static const coralSoft = Color(0xFFFDEBE7);
  static const amber = Color(0xFFB7791F);
  static const amberSoft = Color(0xFFFDF3E1);

  static const travaux = Color(0xFFC2410C);
  static const travauxSoft = Color(0xFFFFEFE5);
  static const services = Color(0xFF0F766E);
  static const servicesSoft = Color(0xFFE1F4F1);
  static const fournitures = Color(0xFFBE185D);
  static const fournituresSoft = Color(0xFFFCE8F1);

  /// Dégradés de l'en-tête et du logo (du clair vers [primaryDark]).
  static const headerStart = Color(0xFF4351D6);
  static const logoStart = Color(0xFF5A67E8);
  static const accent = Color(0xFF7C4DDB);
}

/// Rayons d'arrondi.
class R {
  static const sm = 10.0;
  static const md = 14.0;
  static const lg = 20.0;
  static const xl = 28.0;
  static const pill = 999.0;
}

const softShadow = [
  BoxShadow(color: Color(0x0D12142B), blurRadius: 16, offset: Offset(0, 6)),
];

ThemeData appTheme() {
  // Inter n'a pas de glyphes arabes : Noto Sans Arabic prend le relais.
  final family = I18n.isRTL ? 'NotoSansArabic' : 'Inter';
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: family,
    fontFamilyFallback: const ['NotoSansArabic'],
    scaffoldBackgroundColor: K.bg,
    colorScheme: ColorScheme.fromSeed(
      seedColor: K.primary,
      primary: K.primary,
      surface: K.surface,
      error: K.coral,
    ),
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: K.ink, displayColor: K.ink),
    appBarTheme: const AppBarTheme(
      backgroundColor: K.bg,
      foregroundColor: K.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    dividerTheme: const DividerThemeData(color: K.line, thickness: 1, space: 1),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: K.ink,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(R.md)),
    ),
    switchTheme: SwitchThemeData(
      trackColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? K.primary : K.line,
      ),
      thumbColor: const WidgetStatePropertyAll(Colors.white),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
  );
}
