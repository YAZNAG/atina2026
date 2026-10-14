import 'dart:convert';

import 'package:http/http.dart' as http;

/// Résumé IA d'un avis, dans une langue.
class AiSummary {
  final String headline;
  final List<String> points;
  final List<String> attention;
  final String forWhom;

  const AiSummary({
    required this.headline,
    required this.points,
    this.attention = const [],
    this.forWhom = '',
  });

  static AiSummary? fromJson(Object? j) {
    if (j is! Map<String, dynamic>) return null;
    List<String> list(Object? v) => v is List
        ? v.whereType<String>().where((s) => s.trim().isNotEmpty).toList()
        : const [];
    final headline = j['headline'] is String
        ? (j['headline'] as String).trim()
        : '';
    final points = list(j['points']);
    if (headline.isEmpty || points.isEmpty) return null;
    return AiSummary(
      headline: headline,
      points: points,
      attention: list(j['attention']),
      forWhom: j['forWhom'] is String ? (j['forWhom'] as String).trim() : '',
    );
  }
}

/// Résumés en français et en arabe, rédigés ensemble par le serveur.
class AiSummaries {
  final AiSummary fr;
  final AiSummary ar;
  const AiSummaries(this.fr, this.ar);

  AiSummary of(String lang) => lang == 'ar' ? ar : fr;
}

/// Lit le résumé IA d'un avis sur l'API (`GET /api/tenders/:id/summary`). Le serveur
/// le rédige à la première demande (quelques secondes), puis le garde.
class AiSummaryApi {
  AiSummaryApi(this.baseUrl, {http.Client? client})
    : client = client ?? http.Client();

  final String baseUrl;
  final http.Client client;

  /// La rédaction peut prendre plusieurs secondes.
  static const _timeout = Duration(seconds: 60);

  /// `null` quand le résumé n'existe pas et ne peut pas être rédigé (IA non configurée,
  /// refus, plafond du jour) : l'app garde alors son résumé automatique.
  Future<AiSummaries?> fetch(String id) async {
    final res = await client
        .get(
          Uri.parse('$baseUrl/api/tenders/${Uri.encodeComponent(id)}/summary'),
        )
        .timeout(_timeout);
    if (res.statusCode != 200) return null;
    final body = jsonDecode(utf8.decode(res.bodyBytes));
    if (body is! Map<String, dynamic>) return null;
    final fr = AiSummary.fromJson(body['fr']);
    final ar = AiSummary.fromJson(body['ar']);
    return fr == null || ar == null ? null : AiSummaries(fr, ar);
  }
}
