import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../i18n/i18n.dart';
import '../../services/checkout_service.dart';
import '../../state/checkout_state.dart';
import '../../theme/atina.dart';
import '../../theme/widgets.dart';

/// Première étape du tunnel : livraison à domicile ou retrait en magasin.
///
/// Les modes viennent de `/customer/checkout/meta` : leurs codes appartiennent au
/// back-office (`home`, `pickup`) et ne doivent pas être écrits en dur, sinon le
/// serveur refuse la commande avec « Type de livraison introuvable ».
class DeliveryTypeScreen extends ConsumerStatefulWidget {
  const DeliveryTypeScreen({super.key});

  @override
  ConsumerState<DeliveryTypeScreen> createState() => _DeliveryTypeScreenState();
}

class _DeliveryTypeScreenState extends ConsumerState<DeliveryTypeScreen> {
  /// Modes affichés si le serveur ne répond pas : mêmes codes que la production.
  static const _secours = [
    {'code': 'home', 'name_fr': 'Livraison à domicile', 'name_ar': 'التوصيل إلى المنزل'},
    {'code': 'pickup', 'name_fr': 'Retrait en magasin', 'name_ar': 'الاستلام من المتجر'},
  ];

  List<Map<String, dynamic>> _types = const [];
  String? _selected;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final nodeId = ref.read(checkoutProvider).nodeId;
    try {
      final meta = await CheckoutService.meta(nodeId: nodeId);
      final types = Api.asList(meta['delivery_types']);
      if (mounted) setState(() => _types = types.isEmpty ? _secours : types);
    } catch (_) {
      if (mounted) setState(() => _types = _secours);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool _isPickup(String code) => code.contains('pickup') || code.contains('retrait');

  String _texte(String code) => _isPickup(code)
      ? t('Récupérez votre commande directement au magasin.')
      : t('Recevez votre commande rapidement chez vous.');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: C.bg,
      body: Column(
        children: [
          ScreenHeader(
            title: t('Mode de réception'),
            onBack: () => context.canPop() ? context.pop() : context.go('/main/cart'),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: C.red))
                : ListView(
                    padding: const EdgeInsets.fromLTRB(S.lg, S.sm, S.lg, S.lg),
                    children: [
                      Text(
                        t('Choisissez comment vous souhaitez recevoir votre commande.'),
                        style: ts(13.5, color: C.grey, height: 1.5),
                      ),
                      const SizedBox(height: S.xl),
                      for (final type in _types)
                        Padding(
                          padding: const EdgeInsets.only(bottom: S.md),
                          child: _Option(
                            icon: _isPickup('${type['code']}')
                                ? Icons.storefront_outlined
                                : Icons.delivery_dining_outlined,
                            title: tName(type),
                            text: _texte('${type['code']}'),
                            selected: _selected == type['code'],
                            onTap: () => setState(() => _selected = '${type['code']}'),
                          ),
                        ),
                    ],
                  ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(
              S.lg,
              0,
              S.lg,
              MediaQuery.paddingOf(context).bottom + S.lg,
            ),
            child: PrimaryButton(
              label: t('Continuer'),
              onPressed: _selected == null
                  ? null
                  : () {
                      ref.read(checkoutProvider.notifier).setDeliveryType(_selected!);
                      context.push(
                        _isPickup(_selected!) ? '/order/pickup' : '/order/address',
                      );
                    },
            ),
          ),
        ],
      ),
    );
  }
}

class _Option extends StatelessWidget {
  const _Option({
    required this.icon,
    required this.title,
    required this.text,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String text;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(R.lg),
      child: Container(
        padding: const EdgeInsets.all(S.lg),
        decoration: BoxDecoration(
          color: selected ? C.redSoft : C.bg,
          borderRadius: BorderRadius.circular(R.lg),
          border: Border.all(color: selected ? C.red : C.line),
          boxShadow: selected ? null : cardShadow,
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: selected ? C.bg : C.bgSoft,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 22, color: C.red),
            ),
            const SizedBox(width: S.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: ts(15, weight: F.bold, color: selected ? C.red : C.ink),
                  ),
                  const SizedBox(height: 2),
                  Text(text, style: ts(12.5, color: C.grey, height: 1.4)),
                ],
              ),
            ),
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              size: 20,
              color: selected ? C.red : C.greyLight,
            ),
          ],
        ),
      ),
    );
  }
}
