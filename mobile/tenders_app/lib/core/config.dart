/// Identité de l'application, regroupée ici pour pouvoir la renommer en un seul endroit.
///
/// SAFA9AT s'écrit صفقات en arabe (« marchés »). Le « 9 » note le ق, comme dans
/// l'arabe écrit en lettres latines.
class AppConfig {
  static const name = 'SAFA9AT';
  static const nameAr = 'صفقات';
  static const version = '1.0.0';

  /// Adresse de l'API (`tenders_api`), fixée à la compilation :
  /// `flutter run --dart-define=API_URL=https://api.exemple.ma`.
  static const apiUrl = String.fromEnvironment('API_URL');

  /// Sans API, l'app affiche les avis d'exemple.
  static bool get demoData => apiUrl.isEmpty;
}
