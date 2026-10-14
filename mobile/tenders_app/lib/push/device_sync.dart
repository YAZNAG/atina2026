import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/alert_prefs.dart';

/// Inscrit le téléphone auprès de l'API pour recevoir les alertes, ou l'en retire.
/// Le serveur ne reçoit que le jeton de notification, la langue, les préférences
/// d'alertes et les avis enregistrés (pour les rappels) : rien qui identifie la
/// personne.
class DeviceSync {
  DeviceSync(this.baseUrl, {http.Client? client})
    : client = client ?? http.Client();

  final String baseUrl;
  final http.Client client;

  static const _timeout = Duration(seconds: 15);

  Uri get _uri => Uri.parse('$baseUrl/api/devices');

  Future<void> register({
    required String token,
    required String platform,
    required String lang,
    required AlertPrefs prefs,
    required Iterable<String> saved,
  }) async {
    final res = await client
        .post(
          _uri,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'token': token,
            'platform': platform,
            'lang': lang,
            'prefs': prefs.toJson(),
            'saved': saved.toList(),
          }),
        )
        .timeout(_timeout);
    if (res.statusCode != 204 && res.statusCode != 200) {
      throw Exception('Inscription refusée : HTTP ${res.statusCode}');
    }
  }

  Future<void> unregister(String token) async {
    final res = await client
        .delete(
          _uri,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'token': token}),
        )
        .timeout(_timeout);
    if (res.statusCode != 204 && res.statusCode != 200) {
      throw Exception('Désinscription refusée : HTTP ${res.statusCode}');
    }
  }
}
