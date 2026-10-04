import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'screens/auth/complete_profile_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/verify_otp_screen.dart';
import 'screens/main/categories_screen.dart';
import 'screens/main/category_products_screen.dart';
import 'screens/main/family_screen.dart';
import 'screens/main/favorites_screen.dart';
import 'screens/main/main_shell.dart';
import 'screens/main/product_detail_screen.dart';
import 'screens/main/product_list_screen.dart';
import 'screens/main/promotion_detail_screen.dart';
import 'screens/main/search_screen.dart';
import 'screens/onboarding/language_screen.dart';
import 'screens/onboarding/slides_screen.dart';
import 'screens/order/delivery_address_screen.dart';
import 'screens/order/delivery_datetime_screen.dart';
import 'screens/order/delivery_pickup_screen.dart';
import 'screens/order/delivery_type_screen.dart';
import 'screens/order/order_confirmed_screen.dart';
import 'screens/order/order_detail_screen.dart';
import 'screens/order/order_tracking_screen.dart';
import 'screens/order/orders_screen.dart';
import 'screens/order/payment_screen.dart';
import 'screens/profile/addresses_screen.dart';
import 'screens/profile/location_screen.dart';
import 'screens/profile/settings_screens.dart';
import 'screens/rewards/coupons_screen.dart';
import 'screens/rewards/exchange_screen.dart';
import 'screens/rewards/games_screen.dart';
import 'screens/rewards/loyalty_screen.dart';
import 'screens/rewards/wallet_screen.dart';
import 'screens/splash_screen.dart';
import 'screens/support/claims_screens.dart';
import 'screens/support/support_screens.dart';

/// Routes de l'application, reprises une à une des chemins d'expo-router pour que
/// les deux versions se correspondent écran par écran.
final router = GoRouter(initialLocation: '/', routes: appRoutes, errorBuilder: _error);

/// Écran affiché quand une route n'existe pas.
Widget _error(BuildContext context, GoRouterState state) => Scaffold(
      body: Center(child: Text('Écran introuvable : ${state.uri}')),
    );

/// Table des routes, partagée avec les tests qui montent chaque écran.
final List<RouteBase> appRoutes = [
    GoRoute(path: '/', builder: (_, __) => const SplashScreen()),

    // ── Ouverture ───────────────────────────────────────────────────────────
    GoRoute(path: '/onboarding', builder: (_, __) => const LanguageScreen()),
    GoRoute(
      path: '/onboarding/slides',
      builder: (_, state) => SlidesScreen(
        initialPage: int.tryParse(state.uri.queryParameters['page'] ?? '0') ?? 0,
      ),
    ),

    // ── Connexion ───────────────────────────────────────────────────────────
    GoRoute(path: '/auth/login', builder: (_, __) => const LoginScreen()),
    GoRoute(
      path: '/auth/verify-otp',
      builder: (_, state) => VerifyOtpScreen(phoneNumber: state.extra as String? ?? ''),
    ),
    GoRoute(
      path: '/auth/complete-profile',
      builder: (_, __) => const CompleteProfileScreen(),
    ),

    // ── Onglets ─────────────────────────────────────────────────────────────
    GoRoute(path: '/main/home', builder: (_, __) => const MainShell()),
    GoRoute(path: '/main/products', builder: (_, __) => const MainShell(initialTab: 1)),
    GoRoute(path: '/main/cart', builder: (_, __) => const MainShell(initialTab: 2)),
    GoRoute(path: '/main/offers', builder: (_, __) => const MainShell(initialTab: 3)),
    GoRoute(path: '/profile', builder: (_, __) => const MainShell(initialTab: 4)),

    // ── Catalogue ───────────────────────────────────────────────────────────
    GoRoute(
      path: '/main/search',
      builder: (_, state) =>
          SearchScreen(initialQuery: state.uri.queryParameters['q'] ?? ''),
    ),
    GoRoute(path: '/main/categories', builder: (_, __) => const CategoriesScreen()),
    GoRoute(
      path: '/main/category/:id',
      builder: (_, state) => CategoryProductsScreen(
        categoryId: state.pathParameters['id']!,
        categoryName: state.uri.queryParameters['name'],
      ),
    ),
    GoRoute(
      path: '/main/family/:id',
      builder: (_, state) => FamilyScreen(
        familyId: state.pathParameters['id']!,
        familyName: state.uri.queryParameters['name'],
      ),
    ),
    GoRoute(
      path: '/main/product/:id',
      builder: (_, state) => ProductDetailScreen(articleId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/main/list/:source',
      builder: (_, state) => ProductListScreen(
        source: state.pathParameters['source']!,
        title: state.uri.queryParameters['title'],
      ),
    ),
    GoRoute(path: '/main/favorites', builder: (_, __) => const FavoritesScreen()),
    GoRoute(
      path: '/main/promotion/:id',
      builder: (_, state) => PromotionDetailScreen(id: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/main/pack/:id',
      builder: (_, state) =>
          PromotionDetailScreen(id: state.pathParameters['id']!, isPack: true),
    ),

    // ── Tunnel de commande ──────────────────────────────────────────────────
    GoRoute(path: '/order/delivery-type', builder: (_, __) => const DeliveryTypeScreen()),
    GoRoute(path: '/order/address', builder: (_, __) => const DeliveryAddressScreen()),
    GoRoute(path: '/order/pickup', builder: (_, __) => const DeliveryPickupScreen()),
    GoRoute(path: '/order/datetime', builder: (_, __) => const DeliveryDatetimeScreen()),
    GoRoute(path: '/order/payment', builder: (_, __) => const PaymentScreen()),
    GoRoute(
      path: '/order/confirmed/:id',
      builder: (_, state) => OrderConfirmedScreen(
        orderId: state.pathParameters['id']!,
        reference: state.uri.queryParameters['reference'],
      ),
    ),

    // ── Commandes ───────────────────────────────────────────────────────────
    GoRoute(path: '/order/orders', builder: (_, __) => const OrdersScreen()),
    GoRoute(
      path: '/order/track/:id',
      builder: (_, state) => OrderTrackingScreen(orderId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/order/:id',
      builder: (_, state) => OrderDetailScreen(orderId: state.pathParameters['id']!),
    ),

    // ── Récompenses ─────────────────────────────────────────────────────────
    GoRoute(path: '/profile/loyalty', builder: (_, __) => const LoyaltyScreen()),
    GoRoute(path: '/profile/wallet', builder: (_, __) => const WalletScreen()),
    GoRoute(path: '/profile/coupons', builder: (_, __) => const CouponsScreen()),
    GoRoute(path: '/rewards/exchange', builder: (_, __) => const ExchangeScreen()),
    GoRoute(path: '/games', builder: (_, __) => const GamesScreen()),
    GoRoute(path: '/games/prizes', builder: (_, __) => const PrizesScreen()),

    // ── Profil ──────────────────────────────────────────────────────────────
    GoRoute(path: '/profile/addresses', builder: (_, __) => const AddressesScreen()),
    GoRoute(path: '/profile/location', builder: (_, __) => const LocationScreen()),
    GoRoute(path: '/profile/edit', builder: (_, __) => const EditProfileScreen()),
    GoRoute(
      path: '/profile/notifications',
      builder: (_, __) => const NotificationsScreen(),
    ),
    GoRoute(path: '/profile/language', builder: (_, __) => const LanguageSettingsScreen()),
    GoRoute(
      path: '/profile/delete-account',
      builder: (_, __) => const DeleteAccountScreen(),
    ),

    // ── Assistance ──────────────────────────────────────────────────────────
    GoRoute(
      path: '/support/conversations',
      builder: (_, __) => const ConversationsScreen(),
    ),
    GoRoute(
      path: '/support/chat/:id',
      builder: (_, state) => ChatScreen(conversationId: state.pathParameters['id']!),
    ),
    GoRoute(path: '/support/faq', builder: (_, __) => const FaqScreen()),
    GoRoute(path: '/support/contact', builder: (_, __) => const ContactScreen()),
    GoRoute(path: '/claims', builder: (_, __) => const ClaimsScreen()),
    GoRoute(path: '/claims/new', builder: (_, __) => const CreateClaimScreen()),
    GoRoute(
      path: '/claims/:id',
      builder: (_, state) => ClaimDetailScreen(claimId: state.pathParameters['id']!),
    ),
];
