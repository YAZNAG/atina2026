/// Identité de l'application, regroupée ici pour pouvoir la renommer en un seul endroit.
///
/// Le nom est provisoire : il doit rester distinct de celui de l'app dont on reprend
/// les fonctionnalités (Safaqat), comme le logo et les textes.
class AppConfig {
  static const name = 'Mounaqasa';
  static const nameAr = 'مناقصة';
  static const version = '1.0.0';

  /// Les données affichées sont des exemples tant que l'app n'est pas branchée à un
  /// serveur qui collecte les avis du portail des marchés publics.
  static const demoData = true;
}
