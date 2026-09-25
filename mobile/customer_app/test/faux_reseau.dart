import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// Backend simulé : répond aux routes de l'API avec des données de la même forme
/// que celles du serveur (enveloppe `{ success, data }`, champs `*_fr`/`*_ar`).
///
/// Les tests d'écran n'ont ainsi besoin ni de réseau ni de base de données.
class FauxReseau implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final corps = _reponse(options.path);
    return ResponseBody.fromString(
      jsonEncode({'success': true, 'message': 'Success', 'data': corps}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}

  dynamic _reponse(String chemin) {
    // L'ordre compte : les chemins les plus précis d'abord.
    if (chemin.contains('/catalog/cities')) return _villes;
    if (chemin.contains('/catalog/nodes')) return _magasins;
    if (chemin.contains('/catalog/families/') && chemin.contains('subfamilies')) {
      return {'family': _famille, 'subfamilies': _sousFamilles};
    }
    if (chemin.contains('/catalog/families')) return [_famille];
    if (chemin.contains('sub-categories')) return _sousFamilles;
    if (chemin.contains('/catalog/categories/') && chemin.contains('/articles')) {
      return _articles;
    }
    if (chemin.contains('/catalog/categories')) return _categories;
    if (chemin.contains('/catalog/articles/')) return _article;
    if (chemin.contains('/catalog/articles')) {
      return {
        'data': _articles,
        'pagination': {'total': 2, 'page': 1, 'limit': 20, 'pages': 1},
      };
    }
    if (chemin.contains('/catalog/popular') ||
        chemin.contains('/catalog/top-rated') ||
        chemin.contains('/catalog/recommendations') ||
        chemin.contains('/catalog/cart-complements')) {
      return {'data': _articles, 'hasMore': false};
    }

    if (chemin.contains('/promotions/home')) {
      return {
        'endingSoon': {'ends_at': null, 'products': _articles},
        'bestDeals': _articles,
      };
    }
    if (chemin.contains('/promotions/')) return _promotion;
    if (chemin.contains('/promotions')) return [_promotion];
    if (chemin.contains('/pack/')) return _pack;
    if (chemin.contains('/pack')) return [_pack];

    if (chemin.contains('/cart')) return _panier;

    if (chemin.contains('/checkout/meta')) {
      return {
        'payment_methods': [
          {
            'id': 'pm-1',
            'code': 'cod',
            'name_fr': 'Paiement à la livraison',
            'name_ar': 'الدفع عند التسليم',
            'description': null,
          },
        ],
        // Codes réels du back-office : « home » et « pickup ».
        'delivery_types': [
          {'id': 'dt-1', 'code': 'home', 'name_fr': 'À domicile', 'name_ar': 'إلى المنزل'},
          {'id': 'dt-2', 'code': 'pickup', 'name_fr': 'Retrait', 'name_ar': 'الاستلام'},
        ],
      };
    }
    if (chemin.contains('/checkout/delivery-slots')) {
      return {
        'slots': [
          {
            'id': 'slot-1',
            'name_fr': 'Matin',
            'slot_start': '09:00',
            'slot_end': '12:00',
            'is_full': false,
            'is_past': false,
          },
        ],
        'node': {'id': 'node-1'},
        'needs_backorder': false,
      };
    }
    if (chemin.contains('/checkout/pickup-nodes')) {
      return {'eligible': _magasins};
    }
    if (chemin.contains('/checkout/eligible-nodes')) {
      // Forme réelle de la réponse : magasins retenus, écartés avec motif, et
      // le meilleur choix calculé par le serveur.
      return {
        'address': _adresses.first,
        'eligible': _magasins,
        'ineligible': const [],
        'best_node': _magasins.first,
        'date': null,
      };
    }
    if (chemin.contains('/checkout/calculate')) {
      return {
        'subtotal_ttc': 43.5,
        'delivery_fee': 0,
        'discount_amount': 0,
        'wallet_used': 0,
        'total_ttc': 43.5,
        'cod_amount': 43.5,
        'currency': 'MAD',
      };
    }
    if (chemin.contains('/checkout/create-order')) {
      return {'id': 'cmd-1', 'reference': 'ATN-001', 'status': 'pending'};
    }

    if (chemin.contains('/me/orders/')) return _commande;
    if (chemin.contains('/me/orders')) return [_commande];
    if (chemin.contains('/me/addresses')) return _adresses;
    if (chemin.contains('/me/favorites')) return _articles;
    if (chemin.contains('/me/notifications')) return _notifications;
    if (chemin.contains('/me/wallet') || chemin.contains('/wallet/transactions')) {
      return _mouvements;
    }
    if (chemin.contains('/wallet')) return {'balance': 120.5};
    if (chemin.endsWith('/customer/me')) return _profil;

    if (chemin.contains('/loyalty/summary')) {
      return {'points_balance': 337, 'points_lifetime': 437, 'redeem_step': 100};
    }
    if (chemin.contains('/loyalty/history')) return _mouvements;
    if (chemin.contains('/points-exchange')) return _echange;
    if (chemin.contains('/games/prizes')) return _lots;
    if (chemin.contains('/games')) return _jeux;
    if (chemin.contains('/coupons')) return _coupons;

    if (chemin.contains('/substitutions')) return const [];
    if (chemin.contains('/support/')) return _conversation;
    if (chemin.contains('/support')) return [_conversation];
    if (chemin.contains('/faq')) return _faq;
    if (chemin.contains('/app-info')) {
      return {'support_phone': '+212600000999', 'support_email': 'support@atina.ma'};
    }
    if (chemin.contains('/claims/types')) return _motifs;
    if (chemin.contains('/claims/')) return _reclamation;
    if (chemin.contains('/claims')) return [_reclamation];
    if (chemin.contains('/reviews')) return _avis;

    return const [];
  }
}

// ── Données simulées ────────────────────────────────────────────────────────

const _villes = [
  {'id': 'ville-1', 'name_fr': 'Agadir', 'name_ar': 'أكادير', 'postal_code': '80000'},
];

const _magasins = [
  {
    'id': 'node-1',
    'name_fr': 'Atina Hay Salam',
    'name_ar': 'أتينا حي السلام',
    'address_line1': '12 avenue Hassan II',
    'quartier': 'Hay Salam',
    'lat': 30.42,
    'lng': -9.59,
    'distance': 1.4,
  },
];

const _famille = {
  'id': 'fam-1',
  'name_fr': 'Épicerie salée',
  'name_ar': 'بقالة مالحة',
  'image_url': '/uploads/familles/epicerie.webp',
};

const _sousFamilles = [
  {
    'id': 'sfam-1',
    'name_fr': 'Pâtes, riz & couscous',
    'name_ar': 'معكرونة وأرز وكسكس',
    'image_url': '/uploads/sf/pates.webp',
  },
];

const _categories = [
  {
    'id': 'cat-1',
    'name_fr': 'Petit-déjeuner',
    'name_ar': 'فطور',
    'image_path': '/uploads/cat/pdj.webp',
    'article_count': 12,
  },
];

const _articles = [
  {
    'id': 'art-1',
    'sku_id': 'sku-1',
    'name_fr': 'Beurre doux Président 200 g',
    'name_ar': 'زبدة بريزيدون 200 غ',
    'price_ttc': 26.5,
    'old_price_ttc': 30.0,
    'discount_pct': 12,
    'image_url': '/uploads/skus/beurre.webp',
    'category': {'id': 'cat-1', 'name_fr': 'Petit-déjeuner', 'name_ar': 'فطور'},
  },
  {
    'id': 'art-2',
    'sku_id': 'sku-2',
    'name_fr': 'Menthe fraîche (botte)',
    'name_ar': 'نعناع طازج',
    'price_ttc': 3.0,
    'image_url': '/uploads/skus/menthe.webp',
    'category': {'id': 'cat-2', 'name_fr': 'Fruits & légumes', 'name_ar': 'خضر وفواكه'},
  },
];

const _article = {
  'id': 'art-1',
  'sku_id': 'sku-1',
  'name_fr': 'Beurre doux Président 200 g',
  'name_ar': 'زبدة بريزيدون 200 غ',
  'description_fr': 'Beurre doux de baratte, idéal pour la pâtisserie et le petit-déjeuner.',
  'price_ttc': 26.5,
  'old_price_ttc': 30.0,
  'discount_pct': 12,
  'stock_qty': 40,
  'image_url': '/uploads/skus/beurre.webp',
  'images': [
    {'url': '/uploads/skus/beurre.webp'},
  ],
  'category': {'id': 'cat-1', 'name_fr': 'Petit-déjeuner', 'name_ar': 'فطور'},
};

const _promotion = {
  'id': 'promo-1',
  'name_fr': 'Vente flash épicerie',
  'name_ar': 'تخفيضات البقالة',
  'description_fr': 'Jusqu\'à -30 % sur une sélection.',
  'image_url': '/uploads/promos/flash.webp',
  'articles': _articles,
};

const _pack = {
  'id': 'pack-1',
  'name_fr': 'Pack petit-déjeuner',
  'name_ar': 'باقة الفطور',
  'price_ttc': 89.0,
  'image_url': '/uploads/packs/pdj.webp',
  'articles': _articles,
};

const _panier = {
  'id': 'cart-1',
  'total': 56.0,
  'items': [
    {
      'id': 'item-1',
      'sku_id': 'sku-1',
      'quantity': 2,
      'article': {
        'id': 'art-1',
        'name_fr': 'Beurre doux Président 200 g',
        'name_ar': 'زبدة بريزيدون 200 غ',
        'sku_code': 'BEU-200',
        'price_ttc': 26.5,
        'original_price_ttc': 30.0,
        'discount_pct': 12,
        'image_url': '/uploads/skus/beurre.webp',
        'brand': {'name_fr': 'Président'},
      },
    },
  ],
};

const _profil = {
  'id': 'cli-1',
  'name': 'Amine Benjelloun',
  'email': 'amine@example.com',
  'phone_country': '+212',
  'phone_number': '600000101',
  'city': 'Agadir',
  'avatar_url': null,
  'points_balance': 337,
  'wallet_balance': 120.5,
  'referral_code': 'AMINE101',
};

const _adresses = [
  {
    'id': 'adr-1',
    'label': 'Domicile',
    'street_number': '34',
    'street_name': 'rue Abou Bakr',
    'quartier': 'Maârif',
    'city': 'Agadir',
    'is_default': true,
  },
];

const _commande = {
  'id': 'cmd-1',
  'reference': 'ATN-001',
  'created_at': '2026-09-11T10:00:00.000Z',
  'status': {'code': 'picking', 'name_fr': 'En préparation', 'name_ar': 'قيد التحضير'},
  'delivery_type': {'code': 'delivery'},
  'subtotal_ttc': 43.5,
  'delivery_fee': 0,
  'discount_amount': 0,
  'total_ttc': 43.5,
  'items': [
    {
      'id': 'oi-1',
      'qty': 2,
      'unit_price_ttc': 26.5,
      'article': {
        'id': 'art-1',
        'name_fr': 'Beurre doux Président 200 g',
        'name_ar': 'زبدة بريزيدون 200 غ',
        'image_url': '/uploads/skus/beurre.webp',
      },
    },
  ],
  'address': _adresses,
  'slot': {'slot_start': '09:00', 'slot_end': '12:00'},
};

const _notifications = [
  {
    'id': 'notif-1',
    'title': 'Commande confirmée',
    'body': 'Votre commande ATN-001 est en préparation.',
    'created_at': '2026-09-11T10:05:00.000Z',
    'read_at': null,
  },
];

const _mouvements = [
  {
    'id': 'mv-1',
    'points': 120,
    'amount': 45.0,
    'reason': 'Commande ATN-001',
    'created_at': '2026-09-11T10:30:00.000Z',
  },
];

const _echange = [
  {
    'id': 'ech-1',
    'name_fr': 'Café Atina 250 g',
    'name_ar': 'قهوة أتينا 250 غ',
    'points_cost': 200,
    'image_url': '/uploads/skus/cafe.webp',
  },
];

const _jeux = [
  {
    'id': 'jeu-1',
    'name_fr': 'Roue de la chance',
    'name_ar': 'عجلة الحظ',
    'type': 'wheel',
    'available_plays': 1,
  },
];

const _lots = [
  {
    'id': 'lot-1',
    'name_fr': 'Bon de 20 MAD',
    'name_ar': 'قسيمة 20 درهم',
    'expires_at': '2026-12-31T00:00:00.000Z',
  },
];

const _coupons = [
  {
    'id': 'cp-1',
    'code': 'ATINA10',
    'type': 'percent',
    'value': 10,
    'expires_at': '2026-12-31T00:00:00.000Z',
    'used_at': null,
  },
];

const _conversation = {
  'id': 'conv-1',
  'subject': 'Livraison en retard',
  'created_at': '2026-09-11T11:00:00.000Z',
  'updated_at': '2026-09-11T11:20:00.000Z',
  'messages': [
    {
      'id': 'msg-1',
      'message': 'Bonjour, ma commande a du retard.',
      'sender_type': 'customer',
    },
    {
      'id': 'msg-2',
      'message': 'Bonjour, le livreur arrive dans 15 minutes.',
      'sender_type': 'agent',
    },
  ],
};

const _faq = [
  {
    'id': 'faq-1',
    'question_fr': 'Quels sont les délais de livraison ?',
    'answer_fr': 'Entre 2 et 24 heures selon le créneau choisi.',
  },
];

const _motifs = [
  {'id': 'mot-1', 'name_fr': 'Produit manquant', 'name_ar': 'منتج ناقص'},
];

const _reclamation = {
  'id': 'rec-1',
  'created_at': '2026-09-12T09:00:00.000Z',
  'status': 'open',
  'description': 'Il manquait un article dans ma commande.',
  'type': {'id': 'mot-1', 'name_fr': 'Produit manquant'},
};

const _avis = [
  {
    'id': 'avis-1',
    'rating': 5,
    'comment': 'Très bon produit, livraison rapide.',
    'created_at': '2026-09-10T08:00:00.000Z',
    'customer': {'name': 'Salma R.'},
  },
];
