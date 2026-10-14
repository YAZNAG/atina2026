import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// Autorisation d'afficher des notifications sur ce téléphone.
enum PushPermission {
  /// Accordée.
  granted,

  /// Refusée : seuls les réglages du téléphone peuvent la rétablir.
  denied,

  /// Pas encore demandée.
  notDetermined,

  /// Notifications impossibles : Firebase non configuré, mode démonstration, web.
  unavailable,
}

/// Notification reçue ou touchée.
class PushMessage {
  final String? title;
  final String? body;

  /// Avis à ouvrir, si la notification n'en concerne qu'un.
  final String? tenderId;

  const PushMessage({this.title, this.body, this.tenderId});
}

/// Accès aux notifications du téléphone. L'app ne dépend que de cette interface :
/// les tests la remplacent par un faux.
abstract class PushService {
  /// Prépare le service ; `false` si les notifications sont impossibles ici.
  Future<bool> init();
  Future<PushPermission> permission();
  Future<PushPermission> requestPermission();

  /// Jeton du téléphone pour Firebase Cloud Messaging, `null` si indisponible.
  Future<String?> token();
  Stream<String> get onTokenRefresh;

  /// Notifications reçues pendant que l'app est ouverte (elles ne s'affichent pas
  /// d'elles-mêmes sur Android).
  Stream<PushMessage> get onForeground;

  /// Notification touchée, app en arrière-plan.
  Stream<PushMessage> get onOpened;

  /// Notification qui a lancé l'app, si c'est le cas.
  Future<PushMessage?> launchMessage();

  String get platform;
}

/// Aucune notification (mode démonstration, ou Firebase absent).
class NoPushService implements PushService {
  const NoPushService();

  @override
  Future<bool> init() async => false;
  @override
  Future<PushPermission> permission() async => PushPermission.unavailable;
  @override
  Future<PushPermission> requestPermission() async =>
      PushPermission.unavailable;
  @override
  Future<String?> token() async => null;
  @override
  Stream<String> get onTokenRefresh => const Stream.empty();
  @override
  Stream<PushMessage> get onForeground => const Stream.empty();
  @override
  Stream<PushMessage> get onOpened => const Stream.empty();
  @override
  Future<PushMessage?> launchMessage() async => null;
  @override
  String get platform => 'android';
}

PushMessage _fromRemote(RemoteMessage m) => PushMessage(
  title: m.notification?.title,
  body: m.notification?.body,
  tenderId: m.data['tenderId'] as String?,
);

PushPermission _fromStatus(AuthorizationStatus s) => switch (s) {
  AuthorizationStatus.authorized ||
  AuthorizationStatus.provisional => PushPermission.granted,
  AuthorizationStatus.denied ||
  AuthorizationStatus.deniedPermanently => PushPermission.denied,
  AuthorizationStatus.notDetermined => PushPermission.notDetermined,
};

/// Firebase Cloud Messaging, configuré par les fichiers natifs
/// (`android/app/google-services.json`, `ios/Runner/GoogleService-Info.plist`).
/// Sans eux, [init] renvoie `false` et l'app fonctionne sans notifications.
class FirebasePushService implements PushService {
  bool _ready = false;

  FirebaseMessaging get _fm => FirebaseMessaging.instance;

  @override
  String get platform =>
      defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  @override
  Future<bool> init() async {
    if (kIsWeb) return false;
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp();
      _ready = true;
    } catch (e) {
      debugPrint('Notifications indisponibles : Firebase non configuré ($e)');
      _ready = false;
    }
    return _ready;
  }

  @override
  Future<PushPermission> permission() async {
    if (!_ready) return PushPermission.unavailable;
    try {
      return _fromStatus(
        (await _fm.getNotificationSettings()).authorizationStatus,
      );
    } catch (_) {
      return PushPermission.unavailable;
    }
  }

  @override
  Future<PushPermission> requestPermission() async {
    if (!_ready) return PushPermission.unavailable;
    try {
      final s = await _fm.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      return _fromStatus(s.authorizationStatus);
    } catch (_) {
      return PushPermission.unavailable;
    }
  }

  @override
  Future<String?> token() async {
    if (!_ready) return null;
    try {
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        // Sur iOS, le jeton FCM n'existe qu'une fois le jeton APNs reçu.
        for (var i = 0; i < 10 && await _fm.getAPNSToken() == null; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 500));
        }
      }
      return await _fm.getToken();
    } catch (e) {
      debugPrint('Jeton de notification indisponible : $e');
      return null;
    }
  }

  @override
  Stream<String> get onTokenRefresh =>
      _ready ? _fm.onTokenRefresh : const Stream.empty();

  @override
  Stream<PushMessage> get onForeground => _ready
      ? FirebaseMessaging.onMessage.map(_fromRemote)
      : const Stream.empty();

  @override
  Stream<PushMessage> get onOpened => _ready
      ? FirebaseMessaging.onMessageOpenedApp.map(_fromRemote)
      : const Stream.empty();

  @override
  Future<PushMessage?> launchMessage() async {
    if (!_ready) return null;
    try {
      final m = await _fm.getInitialMessage();
      return m == null ? null : _fromRemote(m);
    } catch (_) {
      return null;
    }
  }
}
