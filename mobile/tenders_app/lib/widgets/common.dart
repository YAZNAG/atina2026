import 'package:flutter/material.dart';

import '../core/config.dart';
import '../i18n/i18n.dart';
import '../models/tender.dart';
import '../theme/theme.dart';

/// Logo : une loupe sur un dossier, dans un carré arrondi vert.
class AppLogo extends StatelessWidget {
  final double size;
  const AppLogo({super.key, this.size = 40});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.3),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF14A085), K.primaryDark],
        ),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Icon(
            Icons.folder_open_rounded,
            color: Colors.white.withValues(alpha: 0.35),
            size: size * 0.62,
          ),
          Icon(Icons.search_rounded, color: Colors.white, size: size * 0.46),
        ],
      ),
    );
  }
}

String appName() => I18n.isRTL ? AppConfig.nameAr : AppConfig.name;

extension CategoryColors on Category {
  Color get color => switch (this) {
    Category.travaux => K.travaux,
    Category.services => K.services,
    Category.fournitures => K.fournitures,
  };
  Color get soft => switch (this) {
    Category.travaux => K.travauxSoft,
    Category.services => K.servicesSoft,
    Category.fournitures => K.fournituresSoft,
  };
  IconData get icon => switch (this) {
    Category.travaux => Icons.construction_rounded,
    Category.services => Icons.handshake_rounded,
    Category.fournitures => Icons.inventory_2_rounded,
  };
}

class Pill extends StatelessWidget {
  final String label;
  final Color color;
  final Color background;
  final IconData? icon;
  const Pill({
    super.key,
    required this.label,
    required this.color,
    required this.background,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(R.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class CategoryPill extends StatelessWidget {
  final Category category;
  const CategoryPill(this.category, {super.key});

  @override
  Widget build(BuildContext context) => Pill(
    label: category.label,
    color: category.color,
    background: category.soft,
    icon: category.icon,
  );
}

/// Échéance : corail sous 3 jours, ambre sous 7, vert au-delà.
class DeadlinePill extends StatelessWidget {
  final DateTime deadline;
  const DeadlinePill(this.deadline, {super.key});

  @override
  Widget build(BuildContext context) {
    final d = daysUntil(deadline);
    final closed = !deadline.isAfter(DateTime.now());
    final (fg, bg) = closed
        ? (K.muted, K.line)
        : d <= 3
        ? (K.coral, K.coralSoft)
        : d <= 7
        ? (K.amber, K.amberSoft)
        : (K.primary, K.primarySoft);
    return Pill(
      label: daysLeftLabel(deadline),
      color: fg,
      background: bg,
      icon: Icons.schedule_rounded,
    );
  }
}

class PrimaryButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool outlined;
  const PrimaryButton({
    super.key,
    required this.label,
    this.icon,
    this.onPressed,
    this.outlined = false,
  });

  @override
  Widget build(BuildContext context) {
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(R.md),
    );
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
        Flexible(
          child: Text(
            label,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
    const size = Size.fromHeight(52);
    if (outlined) {
      return OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          minimumSize: size,
          foregroundColor: K.primary,
          side: const BorderSide(color: K.primary, width: 1.4),
          shape: shape,
        ),
        child: child,
      );
    }
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        minimumSize: size,
        backgroundColor: K.primary,
        disabledBackgroundColor: K.primarySoft,
        shape: shape,
      ),
      child: child,
    );
  }
}

class SectionTitle extends StatelessWidget {
  final String title;
  final Widget? trailing;
  const SectionTitle(this.title, {super.key, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: K.ink,
              ),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Carte blanche aux coins arrondis, utilisée par toutes les sections.
class Panel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color color;
  const Panel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color = K.surface,
  });

  @override
  Widget build(BuildContext context) {
    // Un Material plutôt qu'une décoration : les ListTile et InkWell de la carte
    // y dessinent leur effet d'appui.
    return Material(
      color: color,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(R.lg),
        side: const BorderSide(color: K.line),
      ),
      child: Padding(
        padding: padding,
        child: SizedBox(width: double.infinity, child: child),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 76,
            height: 76,
            decoration: const BoxDecoration(
              color: K.primarySoft,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: K.primary, size: 34),
          ),
          const SizedBox(height: 18),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: K.body, height: 1.45),
          ),
        ],
      ),
    );
  }
}

/// Bandeau rappelant que les avis sont des exemples.
class DemoBanner extends StatelessWidget {
  const DemoBanner({super.key});

  @override
  Widget build(BuildContext context) {
    if (!AppConfig.demoData) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: K.amberSoft,
        borderRadius: BorderRadius.circular(R.sm),
      ),
      child: Row(
        children: [
          const Icon(Icons.science_outlined, size: 16, color: K.amber),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              t("Données de démonstration : ces avis sont des exemples."),
              style: const TextStyle(
                fontSize: 12,
                color: K.amber,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
