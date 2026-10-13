import 'package:flutter/material.dart';

import '../i18n/i18n.dart';
import '../state/scope.dart';
import '../theme/theme.dart';
import 'assistant_screen.dart';
import 'downloads_screen.dart';
import 'home_screen.dart';
import 'saved_screen.dart';
import 'settings_screen.dart';

/// Barre du bas à cinq onglets ; chaque onglet garde sa position de défilement.
class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int index = 0;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final pages = [
      const HomeScreen(),
      const SavedScreen(),
      const AssistantScreen(),
      const DownloadsScreen(),
      const SettingsScreen(),
    ];

    Widget badge(IconData icon, int count) => Badge(
      isLabelVisible: count > 0,
      backgroundColor: K.primary,
      label: Text('$count'),
      child: Icon(icon),
    );

    return Scaffold(
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: K.line)),
        ),
        child: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (i) => setState(() => index = i),
          backgroundColor: K.surface,
          indicatorColor: K.primarySoft,
          surfaceTintColor: Colors.transparent,
          height: 68,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: [
            NavigationDestination(
              icon: const Icon(Icons.explore_outlined),
              selectedIcon: const Icon(Icons.explore_rounded, color: K.primary),
              label: t('Explorer'),
            ),
            NavigationDestination(
              icon: badge(Icons.bookmark_border_rounded, state.saved.length),
              selectedIcon: badge(Icons.bookmark_rounded, state.saved.length),
              label: t('Enregistrés'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.auto_awesome_outlined),
              selectedIcon: const Icon(Icons.auto_awesome, color: K.primary),
              label: t('Assistant'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.download_for_offline_outlined),
              selectedIcon: const Icon(
                Icons.download_for_offline_rounded,
                color: K.primary,
              ),
              label: t('Hors ligne'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.tune_rounded),
              selectedIcon: const Icon(Icons.tune_rounded, color: K.primary),
              label: t('Réglages'),
            ),
          ],
        ),
      ),
    );
  }
}
