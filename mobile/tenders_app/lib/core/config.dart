/// Identité de l'application, regroupée ici pour pouvoir la renommer en un seul endroit.
///
/// Le nom est provisoire : il doit rester distinct de celui de l'app dont on reprend
/// les fonctionnalités (Safaqat), comme le logo et les textes.
class AppConfig {
  static const name = 'Mounaqasa';
  static const nameAr = 'مناقصة';
  static const version = '1.0.0';

  /// Adresse de l'API (`tenders_api`), fixée à la compilation :
  /// `flutter run --dart-define=API_URL=https://api.exemple.ma`.
  static const apiUrl = String.fromEnvironment('API_URL');

  /// Sans API, l'app affiche les avis d'exemple.
  static bool get demoData => apiUrl.isEmpty;
}
