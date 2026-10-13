import 'package:flutter/material.dart';

import '../i18n/i18n.dart';

/// Charte « clair et vert d'eau » : fonds lumineux, vert émeraude profond pour l'action,
/// corail pour l'urgence. Volontairement à l'opposé de l'app d'origine (fond anthracite,
/// accents jaunes).
class K {
  static const primary = Color(0xFF0E7C66);
  static const primaryDark = Color(0xFF09574A);
  static const primarySoft = Color(0xFFE3F3EE);
  static const primaryTint = Color(0xFFF1F9F6);
  static const ink = Color(0xFF0F1A1C);
  static const body = Color(0xFF465659);
  static const muted = Color(0xFF85959A);
  static const line = Color(0xFFE3EAE9);
  static const bg = Color(0xFFF4F7F6);
  static const surface = Color(0xFFFFFFFF);
  static const coral = Color(0xFFE0533D);
  static const coralSoft = Color(0xFFFDEBE7);
  static const amber = Color(0xFFB7791F);
  static const amberSoft = Color(0xFFFDF3E1);

  static const travaux = Color(0xFFC2410C);
  static const travauxSoft = Color(0xFFFFEFE5);
  static const services = Color(0xFF2563EB);
  static const servicesSoft = Color(0xFFE8F0FF);
  static const fournitures = Color(0xFF7C3AED);
  static const fournituresSoft = Color(0xFFF2EBFF);
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
  BoxShadow(color: Color(0x0D0F1A1C), blurRadius: 16, offset: Offset(0, 6)),
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
