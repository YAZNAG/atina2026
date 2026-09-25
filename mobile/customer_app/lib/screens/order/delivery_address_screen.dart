import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../i18n/i18n.dart';
import '../../services/checkout_service.dart';
import '../../services/profile_service.dart';
import '../../state/cart_state.dart';
import '../../state/checkout_state.dart';
import '../../theme/atina.dart';
import '../../theme/widgets.dart';
import '../../widgets/address_form.dart';

/// Étape « Adresse de livraison » : choix parmi les adresses enregistrées, ajout
/// d'une nouvelle, puis vérification que le point de distribution peut livrer.
class DeliveryAddressScreen extends ConsumerStatefulWidget {
  const DeliveryAddressScreen({super.key});

  @override
  ConsumerState<DeliveryAddressScreen> createState() => _DeliveryAddressScreenState();
}

class _DeliveryAddressScreenState extends ConsumerState<DeliveryAddressScreen> {
  List<Map<String, dynamic>> _addresses = const [];
  String? _selectedId;
  bool _loading = true;
  bool _checking = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await ProfileService.addresses();
      if (!mounted) return;
      setState(() {
        _addresses = list;
        final def = list.where((a) => a['is_default'] == true);
        _selectedId = def.isNotEmpty
            ? '${def.first['id']}'
            : (list.isNotEmpty ? '${list.first['id']}' : null);
      });
    } catch (_) {
      if (mounted) setState(() => _addresses = const []);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _add() async {
    final saved = await AddressForm.show(
      context,
      onSubmit: (data) => ProfileService.addAddress(data),
    );
    if (saved == true) _load();
  }

  Future<void> _continue() async {
    final address = _addresses.where((a) => '${a['id']}' == _selectedId);
    if (address.isEmpty) return;

    setState(() {
      _checking = true;
      _error = '';
    });
    try {
      final cart = ref.read(cartProvider).value ?? {};
      final items = CheckoutService.itemsOf(cart);

      var res = await CheckoutService.eligibleNodes(_selectedId!, items);

      // Sans date, le serveur juge sur aujourd'hui : passé la dernière tournée,
      // tous les magasins sont écartés faute de créneau. On retente sur demain
      // avant de conclure que l'adresse n'est pas livrable.
      if (res.eligible.isEmpty &&
          CheckoutService.reasonsOf(res.ineligible).contains('no_slots_for_date')) {
        final demain = DateTime.now().add(const Duration(days: 1));
        res = await CheckoutService.eligibleNodes(
          _selectedId!,
          items,
          date: '${demain.year}-${demain.month.toString().padLeft(2, '0')}'
              '-${demain.day.toString().padLeft(2, '0')}',
        );
      }

      if (!mounted) return;
      if (res.eligible.isEmpty) {
        final motifs = CheckoutService.reasonsOf(res.ineligible);
        setState(() => _error = motifs.contains('no_slots_for_date')
            ? t('Aucun créneau disponible pour le moment. Réessayez plus tard.')
            : motifs.contains('out_of_stock')
                ? t('Un article de votre panier est indisponible dans les magasins qui livrent chez vous.')
                : t('Votre adresse est hors zone de livraison'));
        return;
      }

      ref.read(checkoutProvider.notifier)
        ..setAddress(address.first)
        ..setNode(res.best ?? res.eligible.first);
      context.push('/order/datetime');
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: C.bg,
      body: Column(
        children: [
          ScreenHeader(
            title: t('Adresse de livraison'),
            onBack: () => context.pop(),
            right: IconButton(
              tooltip: t('Ajouter'),
              onPressed: _add,
              icon: const Icon(Icons.add, color: C.red),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: C.red))
                : _addresses.isEmpty
                    ? EmptyState(
                        icon: Icons.location_off_outlined,
                        title: t('Aucune adresse'),
                        text: t('Ajoutez une adresse pour être livré.'),
                        actionLabel: t('Ajouter une adresse'),
                        onAction: _add,
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(S.lg, S.sm, S.lg, S.lg),
                        itemCount: _addresses.length,
                        itemBuilder: (context, i) {
                          final address = _addresses[i];
                          final id = '${address['id']}';
                          final line = [
                            [address['street_number'], address['street_name']]
                                .whereType<String>()
                                .join(' ')
                                .trim(),
                            address['quartier'],
                            address['city'],
                          ].whereType<String>().where((s) => s.isNotEmpty).join(', ');

                          return RadioListTile<String>(
                            value: id,
                            // ignore: deprecated_member_use
                            groupValue: _selectedId,
                            // ignore: deprecated_member_use
                            onChanged: (v) => setState(() {
                              _selectedId = v;
                              _error = '';
                            }),
                            activeColor: C.red,
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              (address['label'] as String?)?.isNotEmpty == true
                                  ? address['label'] as String
                                  : t('Adresse'),
                              style: ts(14, weight: F.semi),
                            ),
                            subtitle: Text(line, style: ts(12.5, color: C.grey)),
                          );
                        },
                      ),
          ),
          if (_error.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: S.lg),
              child: Text(_error, style: ts(12.5, weight: F.medium, color: C.red)),
            ),
          Padding(
            padding: EdgeInsets.fromLTRB(
              S.lg,
              S.md,
              S.lg,
              MediaQuery.paddingOf(context).bottom + S.lg,
            ),
            child: PrimaryButton(
              label: t("Confirmer l'adresse"),
              loading: _checking,
              onPressed: _selectedId == null ? null : _continue,
            ),
          ),
        ],
      ),
    );
  }
}
