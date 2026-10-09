import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../core/config.dart';
import '../i18n/i18n.dart';
import 'atina.dart';

/// Composants partagés de la maquette : en-tête, bouton principal, pastilles,
/// sélecteur de quantité, état vide, badge de remise.

/// En-tête d'écran : bouton retour rond, titre centré, action optionnelle à droite.
class ScreenHeader extends StatelessWidget implements PreferredSizeWidget {
  const ScreenHeader({
    super.key,
    required this.title,
    this.onBack,
    this.right,
    this.subtitle,
  });

  final String title;
  final VoidCallback? onBack;
  final Widget? right;
  final String? subtitle;

  @override
  Size get preferredSize => const Size.fromHeight(58);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(S.lg, 6, S.lg, S.md),
        child: Row(
          children: [
            if (onBack != null)
              const _RoundBack()
                  .withTap(onBack!, t('Retour'))
            else
              const SizedBox(width: 36),
            Expanded(
              child: Column(
                children: [
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ts(17, weight: F.bold),
                  ),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 1),
                      child: Text(
                        subtitle!,
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ts(12, color: C.grey),
                      ),
                    ),
                ],
              ),
            ),
            SizedBox(
              width: 36,
              child: Align(
                alignment: AlignmentDirectional.centerEnd,
                child: right,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoundBack extends StatelessWidget {
  const _RoundBack();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,
      decoration: const BoxDecoration(
        color: C.bg,
        shape: BoxShape.circle,
        boxShadow: cardShadow,
      ),
      child: const Icon(Icons.chevron_left, size: 22, color: C.ink),
    );
  }
}

extension _Tappable on Widget {
  Widget withTap(VoidCallback onTap, String label) => Semantics(
        button: true,
        label: label,
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: this,
        ),
      );
}

/// Titre de section avec lien « Voir tout ».
class SectionTitle extends StatelessWidget {
  const SectionTitle({
    super.key,
    required this.title,
    this.onSeeAll,
    this.seeAllLabel,
  });

  final String title;
  final VoidCallback? onSeeAll;
  final String? seeAllLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(S.lg, S.xl, S.lg, S.md),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: ts(16, weight: F.bold)),
          if (onSeeAll != null)
            InkWell(
              onTap: onSeeAll,
              child: Row(
                children: [
                  Text(
                    seeAllLabel ?? t('Voir tout'),
                    style: ts(13, weight: F.semi, color: C.red),
                  ),
                  const Icon(Icons.chevron_right, size: 16, color: C.red),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Bouton principal rouge pleine largeur (avec icône facultative).
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final off = onPressed == null || loading;
    return Opacity(
      opacity: off ? 0.45 : 1,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(R.md),
          boxShadow: off ? null : buttonShadow,
        ),
        child: SizedBox(
          height: 54,
          width: double.infinity,
          child: ElevatedButton(
            onPressed: off ? null : onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: C.red,
              disabledBackgroundColor: C.red,
              foregroundColor: Colors.white,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(R.md),
              ),
            ),
            child: loading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (icon != null) ...[
                        Icon(icon, size: 18, color: Colors.white),
                        const SizedBox(width: S.sm),
                      ],
                      Text(label, style: ts(15.5, weight: F.semi, color: Colors.white)),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

/// Pastille de filtre (sélectionnée = rouge), avec image ronde facultative.
class AtinaChip extends StatelessWidget {
  const AtinaChip({
    super.key,
    required this.label,
    required this.onTap,
    this.active = false,
    this.imageUrl,
  });

  final String label;
  final VoidCallback onTap;
  final bool active;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: active,
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(R.pill),
        child: Container(
          padding: EdgeInsets.fromLTRB(imageUrl != null ? 6 : 14, 8, 14, 8),
          decoration: BoxDecoration(
            color: active ? C.redSoft : C.bgSoft,
            borderRadius: BorderRadius.circular(R.pill),
            border: Border.all(color: active ? C.red : C.line),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (imageUrl != null && imageUrl!.isNotEmpty) ...[
                ClipOval(
                  child: RemoteImage(
                    url: imageUrl,
                    width: 26,
                    height: 26,
                  ),
                ),
                const SizedBox(width: S.sm),
              ],
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ts(
                  13,
                  weight: active ? F.bold : F.medium,
                  color: active ? C.red : C.body,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Sélecteur de quantité rond de la maquette : − valeur +.
class QtyStepper extends StatelessWidget {
  const QtyStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.min = 1,
    this.max,
    this.busy = false,
    this.removeAtMin = false,
  });

  final int value;
  final ValueChanged<int> onChanged;
  final int min;
  final int? max;
  final bool busy;

  /// Au panier, descendre sous le minimum retire la ligne : le bouton devient
  /// une corbeille. Ailleurs (fiche produit), il reste un « − » désactivé.
  final bool removeAtMin;

  @override
  Widget build(BuildContext context) {
    final atMin = value <= min;
    final canDec = !busy && (value > min || removeAtMin);
    final canInc = !busy && (max == null || value < max!);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _StepButton(
          icon: removeAtMin && atMin ? Icons.delete_outline : Icons.remove,
          onTap: canDec ? () => onChanged(value - 1) : null,
          label: t('Retirer'),
        ),
        SizedBox(
          width: 34,
          child: Text(
            busy ? '…' : '$value',
            textAlign: TextAlign.center,
            style: ts(15, weight: F.bold),
          ),
        ),
        _StepButton(
          icon: Icons.add,
          onTap: canInc ? () => onChanged(value + 1) : null,
          label: t('Ajouter'),
        ),
      ],
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({required this.icon, required this.onTap, required this.label});

  final IconData icon;
  final VoidCallback? onTap;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Opacity(
          opacity: onTap == null ? 0.4 : 1,
          child: Container(
            width: 30,
            height: 30,
            decoration: const BoxDecoration(color: C.red, shape: BoxShape.circle),
            child: Icon(icon, size: 15, color: Colors.white),
          ),
        ),
      ),
    );
  }
}

/// État vide illustré : icône ronde, titre, texte, action.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    this.icon = Icons.inbox_outlined,
    this.text,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final IconData icon;
  final String? text;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 48, 32, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: const BoxDecoration(color: C.redSoft, shape: BoxShape.circle),
            child: Icon(icon, size: 30, color: C.red),
          ),
          const SizedBox(height: S.md),
          Text(title, textAlign: TextAlign.center, style: ts(16.5, weight: F.bold)),
          if (text != null && text!.isNotEmpty) ...[
            const SizedBox(height: S.sm),
            Text(
              text!,
              textAlign: TextAlign.center,
              style: ts(13.5, color: C.grey, height: 1.5),
            ),
          ],
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: S.lg),
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                backgroundColor: C.red,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(R.pill),
                ),
              ),
              child: Text(actionLabel!, style: ts(14, weight: F.semi, color: Colors.white)),
            ),
          ],
        ],
      ),
    );
  }
}

/// Badge de remise jaune (−X %) de la maquette.
class DiscountBadge extends StatelessWidget {
  const DiscountBadge({super.key, required this.value});

  final num value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: C.yellow,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text('-${value.round()}%', style: ts(10.5, weight: F.bold)),
    );
  }
}

/// Image du catalogue : URL relative complétée, cache disque, remplacement discret
/// quand la photo manque (la moitié du catalogue n'en a pas encore).
class RemoteImage extends StatelessWidget {
  const RemoteImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
  });

  final String? url;
  final double? width;
  final double? height;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final full = Config.media(url);
    if (full.isEmpty) return _placeholder();
    return CachedNetworkImage(
      imageUrl: full,
      width: width,
      height: height,
      fit: fit,
      fadeInDuration: const Duration(milliseconds: 160),
      placeholder: (_, __) => _placeholder(),
      errorWidget: (_, __, ___) => _placeholder(),
    );
  }

  Widget _placeholder() => Container(
        width: width,
        height: height,
        color: C.bgSoft,
        alignment: Alignment.center,
        child: const Icon(Icons.image_outlined, color: C.greyLight, size: 26),
      );
}

/// Champ de recherche arrondi de la maquette.
class SearchField extends StatelessWidget {
  const SearchField({
    super.key,
    required this.value,
    required this.onChanged,
    this.hint,
    this.onTap,
    this.readOnly = false,
    this.autofocus = false,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final String? hint;
  final VoidCallback? onTap;
  final bool readOnly;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      initialValue: readOnly ? null : value,
      onChanged: onChanged,
      onTap: onTap,
      readOnly: readOnly,
      autofocus: autofocus,
      textInputAction: TextInputAction.search,
      style: ts(14),
      decoration: InputDecoration(
        hintText: hint ?? t('Rechercher un produit'),
        prefixIcon: const Icon(Icons.search, color: C.grey, size: 20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(R.pill),
          borderSide: const BorderSide(color: C.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(R.pill),
          borderSide: const BorderSide(color: C.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(R.pill),
          borderSide: const BorderSide(color: C.red, width: 1.4),
        ),
      ),
    );
  }
}

/// Pastille ronde de sous-famille : anneau rouge et libellé rouge si sélectionnée.
class SubFamilyChip extends StatelessWidget {
  const SubFamilyChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.imageUrl,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 70,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 58,
                height: 58,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: const Color(0xFFF4F4F4),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: selected ? C.red : Colors.transparent,
                    width: 2,
                  ),
                ),
                child: imageUrl != null && imageUrl!.isNotEmpty
                    ? RemoteImage(url: imageUrl)
                    : Image.asset(
                        'assets/images/atina/basket_small.png',
                        fit: BoxFit.contain,
                      ),
              ),
              const SizedBox(height: 6),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ts(
                  12.5,
                  weight: selected ? F.bold : F.medium,
                  color: selected ? C.red : C.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Compte à rebours d'une section (vente flash) : pastille rouge « hh:mm:ss »
/// posée à côté du titre, comme sur la maquette.
class SectionCountdown extends StatefulWidget {
  const SectionCountdown({super.key, required this.endsAt});

  final String endsAt;

  @override
  State<SectionCountdown> createState() => _SectionCountdownState();
}

class _SectionCountdownState extends State<SectionCountdown> {
  Timer? _timer;
  String? _reste;

  @override
  void initState() {
    super.initState();
    _reste = _restant();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      final valeur = _restant();
      if (valeur != _reste && mounted) setState(() => _reste = valeur);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String? _restant() {
    final fin = DateTime.tryParse(widget.endsAt);
    if (fin == null) return null;
    final secondes = fin.difference(DateTime.now()).inSeconds;
    if (secondes <= 0) return null;
    String deux(int n) => n.toString().padLeft(2, '0');
    return '${deux(secondes ~/ 3600)}:${deux((secondes % 3600) ~/ 60)}:${deux(secondes % 60)}';
  }

  @override
  Widget build(BuildContext context) {
    final reste = _reste;
    if (reste == null) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: C.red,
        borderRadius: BorderRadius.circular(R.pill),
      ),
      child: Text(
        reste,
        style: ts(11.5, weight: F.bold, color: Colors.white)
            .copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
      ),
    );
  }
}
