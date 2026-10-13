import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Charge les vraies polices de l'application dans l'environnement de test.
///
/// Sans cela, Flutter dessine chaque caractère comme un carré de la taille de la
/// police : les textes paraissent deux fois plus larges et les tests signalent
/// des débordements qui n'existent pas sur un téléphone.
Future<void> chargerPolices() async {
  TestWidgetsFlutterBinding.ensureInitialized();

  const inter = {
    'assets/fonts/Inter_400Regular.ttf',
    'assets/fonts/Inter_500Medium.ttf',
    'assets/fonts/Inter_600SemiBold.ttf',
    'assets/fonts/Inter_700Bold.ttf',
    'assets/fonts/Inter_800ExtraBold.ttf',
  };

  final chargeur = FontLoader('Inter');
  for (final chemin in inter) {
    chargeur.addFont(rootBundle.load(chemin));
  }
  await chargeur.load();

  final arabe = FontLoader('NotoSansArabic')
    ..addFont(rootBundle.load('assets/fonts/NotoSansArabic.ttf'));
  await arabe.load();
}
