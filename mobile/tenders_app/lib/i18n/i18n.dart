import 'package:flutter/widgets.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart' hide TextDirection;

import 'ar.dart';

/// Traduction FR/AR, l'arabe en RTL.
///
/// La clé est le texte français ; sans traduction connue, le français est affiché. Les
/// avis eux-mêmes restent en français, la langue de publication du portail.
class I18n {
  static String _lang = 'fr';

  static String get lang => _lang;
  static bool get isRTL => _lang == 'ar';
  static TextDirection get direction =>
      isRTL ? TextDirection.rtl : TextDirection.ltr;

  /// Chiffres latins en arabe marocain, comme sur le portail.
  static String get locale => isRTL ? 'ar_MA' : 'fr_FR';

  static void use(String lang) => _lang = lang == 'ar' ? 'ar' : 'fr';

  /// Sans ces symboles, `DateFormat` lève dès qu'un écran affiche une date.
  static Future<void> loadDateSymbols() async {
    for (final l in ['fr_FR', 'ar_MA', 'ar']) {
      try {
        await initializeDateFormatting(l);
      } catch (_) {
        // La locale manquante retombera sur le français.
      }
    }
  }
}

/// `t('Bonjour {name}', {'name': nom})` — les {x} sont remplacés dans les deux langues.
String t(String fr, [Map<String, Object?>? vars]) {
  var out = I18n.isRTL ? (arStrings[fr] ?? fr) : fr;
  vars?.forEach((k, v) => out = out.replaceAll('{$k}', '${v ?? ''}'));
  return out;
}

DateFormat _df(String pattern) {
  for (final l in [I18n.locale, if (I18n.isRTL) 'ar', 'fr_FR']) {
    try {
      return DateFormat(pattern, l);
    } catch (_) {
      // Locale sans symboles chargés : on essaie la suivante.
    }
  }
  return DateFormat(pattern);
}

/// Les symboles arabes génériques écrivent les chiffres en indo-arabe ; le portail et
/// le reste de l'app utilisent les chiffres latins.
String _latinDigits(String s) => s.replaceAllMapped(
  RegExp('[\u0660-\u0669]'),
  (m) => '${m[0]!.codeUnitAt(0) - 0x0660}',
);

/// Isole un texte français dans une phrase arabe, pour que « 3 mois » ne devienne
/// pas « mois 3 ».
String bidi(String s) => I18n.isRTL ? '\u2068$s\u2069' : s;

/// « 12 nov. 2026 »
String fmtDate(DateTime d) => _latinDigits(_df('d MMM y').format(d));

/// « 12 nov. 2026 à 10:00 »
String fmtDateTime(DateTime d) => t('{date} à {time}', {
  'date': fmtDate(d),
  'time': _latinDigits(_df('HH:mm').format(d)),
});

String fmtNumber(num v) {
  try {
    return NumberFormat.decimalPattern(I18n.locale).format(v);
  } catch (_) {
    return NumberFormat.decimalPattern('fr_FR').format(v);
  }
}

/// « 1 250 000 MAD »
String fmtMad(num v) => '${fmtNumber(v.round())} ${t('MAD')}';

/// Une décimale sous 10, aucune au-delà, sans « ,0 » inutile.
String _short(double x) {
  final s = x.toStringAsFixed(x >= 10 ? 0 : 1);
  final trimmed = s.endsWith('.0') ? s.substring(0, s.length - 2) : s;
  return I18n.isRTL ? trimmed : trimmed.replaceAll('.', ',');
}

/// « 1,3 M MAD » ou « 850 k MAD » pour les cartes.
String fmtMadShort(num v) {
  if (v >= 1000000) return '${_short(v / 1000000)} ${t('M MAD')}';
  if (v >= 1000) return '${_short(v / 1000)} ${t('k MAD')}';
  return fmtMad(v);
}

/// « 412 Ko », « 2,3 Mo »
String fmtSize(int kb) {
  if (kb < 1024) return '$kb ${t('Ko')}';
  return '${_short(kb / 1024)} ${t('Mo')}';
}

/// Jours calendaires restants avant la date limite (négatif une fois passée).
int daysUntil(DateTime deadline, [DateTime? now]) {
  final n = now ?? DateTime.now();
  final a = DateTime(n.year, n.month, n.day);
  final b = DateTime(deadline.year, deadline.month, deadline.day);
  return b.difference(a).inDays;
}

String daysLeftLabel(DateTime deadline) {
  if (deadline.isBefore(DateTime.now())) return t('Clôturé');
  final d = daysUntil(deadline);
  if (d == 0) return t("Clôture aujourd'hui");
  if (d == 1) return t('Clôture demain');
  return t('{n} jours restants', {'n': d});
}

/// « il y a 3 h », « il y a 2 j »
String agoLabel(DateTime d) {
  final diff = DateTime.now().difference(d);
  if (diff.inMinutes < 60) return t("à l'instant");
  if (diff.inHours < 24) return t('il y a {n} h', {'n': diff.inHours});
  return t('il y a {n} j', {'n': diff.inDays});
}
