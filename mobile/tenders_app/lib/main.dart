import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/config.dart';
import 'i18n/i18n.dart';
import 'screens/onboarding_screen.dart';
import 'screens/shell.dart';
import 'state/app_state.dart';
import 'state/scope.dart';
import 'theme/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState();
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

class TendersApp extends StatelessWidget {
  final AppState state;
  const TendersApp({super.key, required this.state});

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
