import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'ai/ai_summary.dart';
import 'core/config.dart';
import 'data/tender_repository.dart';
import 'i18n/i18n.dart';
import 'push/device_sync.dart';
import 'push/push_service.dart';
import 'screens/onboarding_screen.dart';
import 'screens/shell.dart';
import 'screens/tender_detail_screen.dart';
import 'state/app_state.dart';
import 'state/scope.dart';
import 'theme/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppConfig.demoData
      ? AppState()
      : AppState(
          repository: ApiTenderRepository(AppConfig.apiUrl),
          push: FirebasePushService(),
          deviceSync: DeviceSync(AppConfig.apiUrl),
          summaryApi: AiSummaryApi(AppConfig.apiUrl),
        );
  // Le démarrage ne doit jamais rester bloqué : chargement plafonné.
  await Future.any([
    Future.wait([state.load(), I18n.loadDateSymbols()]),
    Future<void>.delayed(const Duration(milliseconds: 1500)),
  ]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      statusBarBrightness: Brightness.light,
    ),
  );
  runApp(TendersApp(state: state));
}

class TendersApp extends StatefulWidget {
  final AppState state;
  const TendersApp({super.key, required this.state});

  @override
  State<TendersApp> createState() => _TendersAppState();
}

class _TendersAppState extends State<TendersApp> {
  final _navigator = GlobalKey<NavigatorState>();
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  final List<StreamSubscription<Object?>> _subs = [];

  AppState get state => widget.state;

  @override
  void initState() {
    super.initState();
    // Abonnement avant l'initialisation : la notification qui a lancé l'app arrive
    // par le même flux.
    _subs
      ..add(state.openRequests.listen(_openTender))
      ..add(state.foregroundMessages.listen(_showBanner));
    state.initPush();
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }

  /// Notification touchée : fiche de l'avis, ou liste pour une alerte groupée.
  Future<void> _openTender(String? id) async {
    if (id != null && state.byId(id) == null) await state.refresh();
    final nav = _navigator.currentState;
    if (nav == null || !mounted) return;
    nav.popUntil((r) => r.isFirst);
    if (id != null && state.byId(id) != null) {
      nav.push(TenderDetailScreen.route(id));
    }
  }

  void _showBanner(PushMessage m) {
    final title = m.title ?? t('Nouvel avis');
    _messenger.currentState?.showSnackBar(
      SnackBar(
        content: Text(m.body == null ? title : '$title\n${m.body}'),
        duration: const Duration(seconds: 6),
        action: SnackBarAction(
          label: t('Voir'),
          onPressed: () => _openTender(m.tenderId),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: state,
      // La langue change sans redémarrer : seul le sous-arbre se reconstruit.
      child: ListenableBuilder(
        listenable: state,
        builder: (context, _) => MaterialApp(
          title: AppConfig.name,
          debugShowCheckedModeBanner: false,
          navigatorKey: _navigator,
          scaffoldMessengerKey: _messenger,
          theme: appTheme(),
          locale: Locale(state.lang),
          supportedLocales: const [Locale('fr'), Locale('ar')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          builder: (context, child) => MediaQuery.withClampedTextScaling(
            maxScaleFactor: 1.3,
            child: child ?? const SizedBox.shrink(),
          ),
          home: state.onboarded ? const Shell() : const OnboardingScreen(),
        ),
      ),
    );
  }
}
