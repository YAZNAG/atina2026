import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/tender.dart';
import 'demo_tenders.dart';

/// Liste des avis et d'où elle vient.
class TenderFeed {
  final List<Tender> tenders;

  /// Moment où la liste a été reçue du serveur.
  final DateTime syncedAt;

  /// Vrai si le serveur était injoignable et que la dernière liste enregistrée sert.
  final bool fromCache;

  const TenderFeed(this.tenders, this.syncedAt, {this.fromCache = false});
}

/// Source des avis. L'app ne dépend que de cette interface.
abstract class TenderRepository {
  bool get isDemo;
  Future<TenderFeed> fetch();
}

class DemoTenderRepository implements TenderRepository {
  @override
  bool get isDemo => true;

  @override
  Future<TenderFeed> fetch() async => TenderFeed(demoTenders(), DateTime.now());
}

/// Le serveur est injoignable et aucune liste n'a encore été enregistrée.
class TenderFetchException implements Exception {
  final String message;
  const TenderFetchException(this.message);
  @override
  String toString() => message;
}

/// Avis ouverts lus sur l'API (`tenders_api`), page par page. La dernière liste reçue
/// est gardée sur le téléphone : sans réseau, l'app l'affiche au lieu d'un écran vide.
class ApiTenderRepository implements TenderRepository {
  ApiTenderRepository(this.baseUrl, {http.Client? client, this.pageSize = 500})
    : client = client ?? http.Client();

  final String baseUrl;
  final http.Client client;

  /// Avis demandés par requête (500 au plus côté serveur).
  final int pageSize;
  static const _cacheKey = 'tenders_cache';
  static const _cacheAtKey = 'tenders_cache_at';
  static const _timeout = Duration(seconds: 20);

  @override
  bool get isDemo => false;

  @override
  Future<TenderFeed> fetch() async {
    try {
      final items = await _download();
      final now = DateTime.now();
      await _save(items, now);
      return TenderFeed(_parse(items), now);
    } catch (e) {
      final cached = await _load();
      if (cached != null) return cached;
      throw TenderFetchException('$e');
    }
  }

  Future<List<Map<String, dynamic>>> _download() async {
    final items = <Map<String, dynamic>>[];
    var offset = 0;
    for (;;) {
      final uri = Uri.parse('$baseUrl/api/tenders').replace(
        queryParameters: {
          'status': 'open',
          'sort': 'recent',
          'limit': '$pageSize',
          'offset': '$offset',
        },
      );
      final res = await client.get(uri).timeout(_timeout);
      if (res.statusCode != 200) {
        throw TenderFetchException('Serveur : HTTP ${res.statusCode}');
      }
      final body =
          jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      final page = (body['items'] as List).whereType<Map<String, dynamic>>();
      items.addAll(page);
      final total = body['total'] is int ? body['total'] as int : items.length;
      offset += pageSize;
      if (page.isEmpty || items.length >= total) return items;
    }
  }

  /// Les avis illisibles sont ignorés un à un, sans perdre toute la liste.
  List<Tender> _parse(List<Map<String, dynamic>> items) {
    final out = <Tender>[];
    for (final j in items) {
      try {
        out.add(Tender.fromJson(j));
      } on FormatException {
        // Avis incomplet : ignoré.
      }
    }
    return out;
  }

  Future<void> _save(List<Map<String, dynamic>> items, DateTime at) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_cacheKey, jsonEncode(items));
      await p.setString(_cacheAtKey, at.toIso8601String());
    } catch (_) {
      // Sans stockage, l'app fonctionne quand même en ligne.
    }
  }

  Future<TenderFeed?> _load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString(_cacheKey);
      final at = DateTime.tryParse(p.getString(_cacheAtKey) ?? '');
      if (raw == null || at == null) return null;
      final items = (jsonDecode(raw) as List).whereType<Map<String, dynamic>>();
      return TenderFeed(_parse(items.toList()), at, fromCache: true);
    } catch (_) {
      return null;
    }
  }
}
