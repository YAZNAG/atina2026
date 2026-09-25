import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../i18n/i18n.dart';
import '../../services/cart_service.dart';
import '../../services/checkout_service.dart';
import '../../state/cart_state.dart';
import '../../state/checkout_state.dart';
import '../../theme/atina.dart';
import '../../theme/widgets.dart';

/// Dernière étape : moyen de paiement, code promo, récapitulatif chiffré et
/// confirmation de la commande.
class PaymentScreen extends ConsumerStatefulWidget {
  const PaymentScreen({super.key});

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  final _promo = TextEditingController();

  List<Map<String, dynamic>> _methods = const [];
  Map<String, dynamic> _calculation = const {};
  String? _method;
  bool _loading = true;
  bool _calculating = false;
  bool _submitting = false;
  String _error = '';
  String _promoMessage = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _promo.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final checkout = ref.read(checkoutProvider);
    try {
      final meta = await CheckoutService.meta(nodeId: checkout.nodeId);
      if (!mounted) return;
      final methods = Api.asList(meta['payment_methods']);
      setState(() {
        _methods = methods;
        _method = methods.isNotEmpty ? '${methods.first['code']}' : null;
      });
      await _calculate();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _calculate() async {
    final checkout = ref.read(checkoutProvider);
    final cart = ref.read(cartProvider).value ?? {};
    if (checkout.nodeId == null) return;
    setState(() => _calculating = true);
    try {
      final res = await CheckoutService.calculate(
        nodeId: checkout.nodeId!,
        deliveryTypeCode: checkout.deliveryTypeCode,
        cartItems: CheckoutService.itemsOf(cart),
        paymentMethodCode: _method,
        promoCode: _promo.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _calculation = res;
        final couponError = res['coupon_error'] as String?;
        if (_promo.text.trim().isEmpty) {
          _promoMessage = '';
        } else {
          _promoMessage =
              couponError ?? t('Code promo appliqué');
        }
      });
    } catch (e) {
      if (mounted) setState(() => _error = t('Erreur de calcul'));
    } finally {
      if (mounted) setState(() => _calculating = false);
    }
  }

  Future<void> _confirm() async {
    final checkout = ref.read(checkoutProvider);
    final cart = ref.read(cartProvider).value ?? {};
    if (_method == null || checkout.nodeId == null) return;

    setState(() {
      _submitting = true;
      _error = '';
    });
    try {
      final order = await CheckoutService.createOrder({
        'cart_items': CheckoutService.itemsOf(cart),
        'delivery_type_code': checkout.deliveryTypeCode,
        'node_id': checkout.nodeId,
        if (checkout.addressId != null) 'address_id': checkout.addressId,
        if (checkout.slotId != null) 'slot_id': checkout.slotId,
        'payment_method_code': _method,
        if (_promo.text.trim().isNotEmpty) 'promo_code': _promo.text.trim(),
      });
      if (!mounted) return;
      ref.read(checkoutProvider.notifier).reset();

      // Le serveur ne vide pas le panier à la création de la commande : sans ce
      // nettoyage, les mêmes articles restent au panier et peuvent être
      // commandés une seconde fois.
      try {
        await CartService.clear();
      } catch (_) {
        // Le panier sera vidé au prochain rafraîchissement.
      }
      await ref.read(cartProvider.notifier).refresh();
      if (!mounted) return;
      context.go('/order/confirmed/${order['id']}?reference=${order['reference'] ?? ''}');
    } on ApiError catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = t('Erreur lors de la confirmation'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  num _n(String key) => (_calculation[key] as num?) ?? 0;

  @override
  Widget build(BuildContext context) {
    final checkout = ref.watch(checkoutProvider);

    return Scaffold(
      backgroundColor: C.bg,
      body: Column(
        children: [
          ScreenHeader(title: t('Méthodes de paiement'), onBack: () => context.pop()),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: C.red))
                : ListView(
                    padding: const EdgeInsets.fromLTRB(S.lg, S.sm, S.lg, S.lg),
                    children: [
                      Text(
                        t('Choisissez votre méthode de paiement préférée pour finaliser la commande.'),
                        style: ts(13.5, color: C.grey, height: 1.5),
                      ),
                      const SizedBox(height: S.lg),
                      for (final method in _methods)
                        RadioListTile<String>(
                          value: '${method['code']}',
                          // ignore: deprecated_member_use
                          groupValue: _method,
                          // ignore: deprecated_member_use
                          onChanged: (v) {
                            setState(() => _method = v);
                            _calculate();
                          },
                          activeColor: C.red,
                          contentPadding: EdgeInsets.zero,
                          title: Text(tName(method), style: ts(14, weight: F.semi)),
                          subtitle: method['description'] == null
                              ? null
                              : Text('${method['description']}',
                                  style: ts(12, color: C.grey)),
                        ),
                      const SizedBox(height: S.lg),
                      Text(t('Code promo'), style: ts(14, weight: F.bold)),
                      const SizedBox(height: S.sm),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _promo,
                              textCapitalization: TextCapitalization.characters,
                              style: ts(14),
                              decoration: InputDecoration(hintText: t('Entrez votre code')),
                            ),
                          ),
                          const SizedBox(width: S.sm),
                          SizedBox(
                            height: 48,
                            child: OutlinedButton(
                              onPressed: _calculating ? null : _calculate,
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: C.red),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(R.md),
                                ),
                              ),
                              child: Text(t('Appliquer'),
                                  style: ts(13.5, weight: F.semi, color: C.red)),
                            ),
                          ),
                        ],
                      ),
                      if (_promoMessage.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                            _promoMessage,
                            style: ts(
                              12.5,
                              weight: F.medium,
                              color: _promoMessage == t('Code promo appliqué')
                                  ? C.green
                                  : C.red,
                            ),
                          ),
                        ),
                      const SizedBox(height: S.xl),
                      _recap(checkout),
                      if (_error.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: S.md),
                          child: Text(_error,
                              style: ts(12.5, weight: F.medium, color: C.red)),
                        ),
                    ],
                  ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(
              S.lg,
              S.sm,
              S.lg,
              MediaQuery.paddingOf(context).bottom + S.lg,
            ),
            child: PrimaryButton(
              label: t('Confirmer le paiement'),
              loading: _submitting,
              onPressed: _method == null || _calculating ? null : _confirm,
            ),
          ),
        ],
      ),
    );
  }

  Widget _recap(Checkout checkout) {
    final delivery = _n('delivery_fee');
    final discount = _n('discount_amount');

    return Container(
      padding: const EdgeInsets.all(S.md),
      decoration: BoxDecoration(
        color: C.bgSoft,
        borderRadius: BorderRadius.circular(R.md),
      ),
      child: Column(
        children: [
          if (checkout.slotLabel != null)
            _line(t('Créneau'), checkout.slotLabel!),
          if (checkout.node != null)
            _line(
              checkout.isPickup ? t('Magasin') : t('Préparé par'),
              '${checkout.node?['name_fr'] ?? checkout.node?['name'] ?? ''}',
            ),
          const Divider(height: S.lg),
          _line(t('Sous-total'), fmtPrice(_n('subtotal_ttc'))),
          _line(
            t('Frais de livraison'),
            delivery == 0 ? t('Offert') : fmtPrice(delivery),
          ),
          if (discount > 0) _line(t('Remise'), '- ${fmtPrice(discount)}'),
          const Divider(height: S.lg),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(t('Total'), style: ts(15, weight: F.bold)),
              _calculating
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: C.red),
                    )
                  : Text(fmtPrice(_n('total_ttc')),
                      style: ts(18, weight: F.black, color: C.red)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _line(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: ts(13, color: C.grey)),
            Flexible(
              child: Text(
                value,
                textAlign: TextAlign.end,
                style: ts(13, weight: F.semi),
              ),
            ),
          ],
        ),
      );
}
