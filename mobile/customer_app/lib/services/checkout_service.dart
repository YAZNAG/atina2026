import 'dart:convert';

import '../core/api.dart';

/// Tunnel de commande : modes de livraison, créneaux, calcul du total, création.
///
/// Les lignes du panier sont envoyées à chaque étape sous la forme attendue par le
/// backend : `{sku_id, qty, pack_id}`.
class CheckoutService {
  /// Modes de livraison, moyens de paiement et réglages du point de distribution.
  static Future<Map<String, dynamic>> meta({String? nodeId}) async =>
      Api.asMap(await Api.get(
        '/customer/checkout/meta',
        query: nodeId == null ? null : {'node_id': nodeId},
      ));

  /// Points de distribution capables de livrer cette adresse.
  ///
  /// La réponse sépare les magasins retenus de ceux écartés, avec le motif :
  /// hors rayon, pas de créneau ce jour-là, stock insuffisant. Le tunnel s'en
  /// sert pour expliquer au client ce qui bloque au lieu d'un message unique.
  static Future<({
    List<Map<String, dynamic>> eligible,
    List<Map<String, dynamic>> ineligible,
    Map<String, dynamic>? best,
  })> eligibleNodes(
    String addressId,
    List<Map<String, dynamic>> cartItems, {
    String? date,
  }) async {
    final data = Api.asMap(await Api.post(
      '/customer/checkout/eligible-nodes',
      body: {
        'address_id': addressId,
        'cart_items': cartItems,
        if (date != null) 'date': date,
      },
    ));
    return (
      eligible: Api.asList(data['eligible']),
      ineligible: Api.asList(data['ineligible']),
      best: data['best_node'] is Map ? Api.asMap(data['best_node']) : null,
    );
  }

  /// Motifs renvoyés par le serveur pour un magasin écarté.
  static Set<String> reasonsOf(List<Map<String, dynamic>> ineligible) {
    final codes = <String>{};
    for (final node in ineligible) {
      final raisons = node['reasons'];
      if (raisons is List) {
        for (final r in raisons) {
          if (r is Map && r['code'] is String) codes.add(r['code'] as String);
        }
      }
    }
    return codes;
  }

  /// Points de retrait possibles pour ce panier.
  static Future<List<Map<String, dynamic>>> pickupNodes(
    List<Map<String, dynamic>> cartItems, {
    String? date,
  }) async {
    final data = await Api.get('/customer/checkout/pickup-nodes', query: {
      'cart_items': jsonEncode(cartItems),
      if (date != null) 'date': date,
    });
    final raw = data is Map ? (data['eligible'] ?? data['items'] ?? data) : data;
    return Api.asList(raw);
  }

  /// Créneaux proposés. `needs_backorder` signale un article en rupture (US-074).
  static Future<({
    List<Map<String, dynamic>> slots,
    String? nodeId,
    bool needsBackorder,
    String? earliestDate,
    String? message,
  })> deliverySlots({
    String? addressId,
    String? nodeId,
    String? deliveryTypeCode,
    String? date,
    List<Map<String, dynamic>>? cartItems,
  }) async {
    final data = Api.asMap(await Api.get('/customer/checkout/delivery-slots', query: {
      if (addressId != null) 'address_id': addressId,
      if (nodeId != null) 'node_id': nodeId,
      if (deliveryTypeCode != null) 'delivery_type_code': deliveryTypeCode,
      if (date != null) 'date': date,
      if (cartItems != null && cartItems.isNotEmpty) 'cart_items': jsonEncode(cartItems),
    }));

    return (
      slots: Api.asList(data['slots'] ?? data),
      nodeId: data['node'] is Map ? data['node']['id'] as String? : null,
      needsBackorder: data['needs_backorder'] == true,
      earliestDate: data['earliest_date'] as String?,
      message: data['message'] as String?,
    );
  }

  /// Détail du total : sous-total, TVA, frais, remise, portefeuille, reste à payer.
  static Future<Map<String, dynamic>> calculate({
    required String nodeId,
    required String deliveryTypeCode,
    required List<Map<String, dynamic>> cartItems,
    String? paymentMethodCode,
    num? walletUsed,
    String? promoCode,
  }) async =>
      Api.asMap(await Api.post('/customer/checkout/calculate', body: {
        'node_id': nodeId,
        'delivery_type_code': deliveryTypeCode,
        'cart_items': cartItems,
        if (paymentMethodCode != null) 'payment_method_code': paymentMethodCode,
        if (walletUsed != null) 'wallet_used': walletUsed,
        if (promoCode != null && promoCode.isNotEmpty) 'promo_code': promoCode,
      }));

  static Future<Map<String, dynamic>> createOrder(Map<String, dynamic> payload) async =>
      Api.asMap(await Api.post('/customer/checkout/create-order', body: payload));

  /// Lignes du panier au format attendu par le tunnel.
  static List<Map<String, dynamic>> itemsOf(Map<String, dynamic> cart) {
    final items = cart['items'];
    if (items is! List) return const [];
    return items.whereType<Map>().map((item) {
      final qty = item['quantity'];
      return <String, dynamic>{
        'sku_id': item['sku_id'] ?? (item['sku'] is Map ? item['sku']['id'] : null),
        'qty': qty is num ? qty.toInt() : 1,
        if (item['pack'] is Map) 'pack_id': item['pack']['id'],
      };
    }).where((e) => e['sku_id'] != null).toList();
  }
}

/// Commandes du client : liste, détail, suivi.
class OrderService {
  static Future<List<Map<String, dynamic>>> list() async =>
      Api.asList(await Api.get('/customer/me/orders'));

  static Future<Map<String, dynamic>> detail(String id) async =>
      Api.asMap(await Api.get('/customer/me/orders/$id'));

  /// Remplacements proposés par le préparateur pour une commande.
  static Future<List<Map<String, dynamic>>> substitutions(String orderId) async =>
      Api.asList(await Api.get('/customer/orders/$orderId/substitutions'));

  static Future<List<Map<String, dynamic>>> pendingSubstitutions() async =>
      Api.asList(await Api.get('/customer/substitutions/pending'));

  /// Réponse du client à une proposition : `accept`, `reject` ou `refund`.
  static Future<void> respondSubstitution(String sessionItemId, String decision) async =>
      Api.patch('/customer/substitutions/$sessionItemId/respond',
          body: {'decision': decision});
}
