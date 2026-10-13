import 'package:flutter/widgets.dart';

import 'app_state.dart';

/// Rend l'[AppState] accessible à tout l'arbre ; les widgets qui le lisent par
/// [AppScope.of] se reconstruisent à chaque changement.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child})
    : super(notifier: state);

  static AppState of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;

  /// Pour les actions (appui sur un bouton) : sans abonnement aux changements.
  static AppState read(BuildContext context) =>
      context.getInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
