import 'package:atina_client/core/api.dart';
import 'package:atina_client/i18n/i18n.dart';
import 'package:atina_client/router.dart';
import 'package:atina_client/theme/atina.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'faux_reseau.dart';

import 'polices.dart';

/// Chaque écran de l'application, monté avec un backend simulé qui répond comme
/// le vrai. Le test échoue si un écran lève une exception, reste bloqué sur son
/// indicateur de chargement ou n'affiche pas son titre.
///
/// C'est la garantie que « toutes les pages sont fonctionnelles » : les 40 routes
/// sont ouvertes une à une à chaque exécution.
void main() {
  setUpAll(() async {
    await chargerPolices();
    Api.client.httpClientAdapter = FauxReseau();
    await I18n.loadDateSymbols();
  });

  setUp(() {
    I18n.langNotifier.value = 'fr';
  });

  for (final ecran in ecrans) {
    testWidgets('AR ${ecran.route}', (tester) async {
      I18n.langNotifier.value = 'ar';
      await I18n.setLanguage('ar');
      addTearDown(() => I18n.setLanguage('fr'));

      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(_app(ecran.route));
      for (var i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 120));
      }

      expect(tester.takeException(), isNull,
          reason: 'exception en arabe sur ${ecran.route}');
    });

    testWidgets('${ecran.route} — ${ecran.attendu}', (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(_app(ecran.route));

      // Laisse partir les appels réseau simulés, sans attendre les animations
      // sans fin (compte à rebours des ventes flash, roue des jeux).
      for (var i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 120));
      }

      expect(tester.takeException(), isNull, reason: 'exception sur ${ecran.route}');
      expect(
        find.text(ecran.attendu),
        findsWidgets,
        reason: '« ${ecran.attendu} » introuvable sur ${ecran.route}',
      );
    });
  }
}

Widget _app(String route) {
  return ProviderScope(
    child: MaterialApp.router(
      debugShowCheckedModeBanner: false,
      theme: atinaTheme(),
      routerConfig: GoRouter(initialLocation: route, routes: appRoutes),
    ),
  );
}

/// Route testée et un texte qui doit s'y trouver.
class Ecran {
  const Ecran(this.route, this.attendu);

  final String route;
  final String attendu;
}

const ecrans = [
  // Ouverture et connexion
  Ecran('/onboarding', 'Choisissez votre langue'),
  Ecran('/onboarding/slides', 'Tous vos essentiels au même endroit'),
  Ecran('/auth/login', 'Bienvenue'),
  Ecran('/auth/verify-otp', 'Vérification du numéro'),
  Ecran('/auth/complete-profile', 'Complétez votre profil'),

  // Onglets
  Ecran('/main/home', 'Catégories'),
  Ecran('/main/products', 'Produits'),
  Ecran('/main/cart', 'Mon panier'),
  Ecran('/main/offers', 'Offres'),
  Ecran('/profile', 'Mon Compte'),

  // Catalogue
  Ecran('/main/search', 'Recherches populaires'),
  Ecran('/main/categories', 'Catégories'),
  Ecran('/main/category/cat-1?name=Petit-déjeuner', 'Petit-déjeuner'),
  Ecran('/main/family/fam-1?name=Épicerie salée', 'Épicerie salée'),
  Ecran('/main/product/art-1', 'Description'),
  Ecran('/main/list/popular?title=Produits populaires', 'Produits populaires'),
  Ecran('/main/favorites', 'Mes favoris'),
  Ecran('/main/promotion/promo-1', 'Produits en promotion'),
  Ecran('/main/pack/pack-1', 'Produits inclus'),

  // Tunnel de commande
  Ecran('/order/delivery-type', 'Mode de réception'),
  Ecran('/order/address', 'Adresse de livraison'),
  Ecran('/order/pickup', 'Retrait en magasin'),
  Ecran('/order/datetime', 'Date & Heure'),
  Ecran('/order/payment', 'Méthodes de paiement'),
  Ecran('/order/confirmed/cmd-1?reference=ATN-001', 'Commande confirmée !'),

  // Commandes
  Ecran('/order/orders', 'Historique des commandes'),
  Ecran('/order/cmd-1', 'Détail de la commande'),
  Ecran('/order/track/cmd-1', 'Suivi de commande'),

  // Récompenses
  Ecran('/profile/loyalty', 'Mes points Atina'),
  Ecran('/profile/wallet', 'Solde disponible'),
  Ecran('/profile/coupons', 'Mes Coupons'),
  Ecran('/rewards/exchange', 'Points disponibles'),
  Ecran('/games', 'Jeux'),
  Ecran('/games/prizes', 'Mes gains'),

  // Profil
  Ecran('/profile/addresses', 'Mes adresses'),
  Ecran('/profile/location', 'Ma localisation'),
  Ecran('/profile/edit', 'Nom complet'),
  Ecran('/profile/notifications', 'Notifications'),
  Ecran('/profile/language', 'Langue'),
  Ecran('/profile/delete-account', 'Supprimer mon compte'),

  // Assistance
  Ecran('/support/conversations', 'Chat avec le support'),
  Ecran('/support/chat/conv-1', 'Livraison en retard'),
  Ecran('/support/faq', 'FAQ'),
  Ecran('/support/contact', 'Contact'),
  Ecran('/claims', 'Mes réclamations'),
  Ecran('/claims/new', 'Nouvelle réclamation'),
  Ecran('/claims/rec-1', 'Réclamation'),
];
