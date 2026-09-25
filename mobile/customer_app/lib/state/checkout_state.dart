import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Choix faits pendant le tunnel de commande, partagés par les cinq écrans :
/// mode de réception, adresse ou magasin, créneau, paiement.
@immutable
class Checkout {
  const Checkout({
    // Code du back-office : « home » pour la livraison, « pickup » pour le retrait.
    this.deliveryTypeCode = 'home',
    this.addressId,
    this.address,
    this.nodeId,
    this.node,
    this.slotId,
    this.slotLabel,
    this.date,
    this.paymentMethodCode,
    this.promoCode = '',
    this.notes = '',
  });

  final String deliveryTypeCode;
  final String? addressId;
  final Map<String, dynamic>? address;
  final String? nodeId;
  final Map<String, dynamic>? node;
  final String? slotId;
  final String? slotLabel;
  final DateTime? date;
  final String? paymentMethodCode;
  final String promoCode;
  final String notes;

  bool get isPickup => deliveryTypeCode.contains('pickup');

  Checkout copyWith({
    String? deliveryTypeCode,
    String? addressId,
    Map<String, dynamic>? address,
    String? nodeId,
    Map<String, dynamic>? node,
    String? slotId,
    String? slotLabel,
    DateTime? date,
    String? paymentMethodCode,
    String? promoCode,
    String? notes,
  }) =>
      Checkout(
        deliveryTypeCode: deliveryTypeCode ?? this.deliveryTypeCode,
        addressId: addressId ?? this.addressId,
        address: address ?? this.address,
        nodeId: nodeId ?? this.nodeId,
        node: node ?? this.node,
        slotId: slotId ?? this.slotId,
        slotLabel: slotLabel ?? this.slotLabel,
        date: date ?? this.date,
        paymentMethodCode: paymentMethodCode ?? this.paymentMethodCode,
        promoCode: promoCode ?? this.promoCode,
        notes: notes ?? this.notes,
      );
}

class CheckoutNotifier extends StateNotifier<Checkout> {
  CheckoutNotifier() : super(const Checkout());

  void setDeliveryType(String code) => state = Checkout(deliveryTypeCode: code);

  void setAddress(Map<String, dynamic> address) => state = state.copyWith(
        addressId: '${address['id']}',
        address: address,
      );

  void setNode(Map<String, dynamic> node) => state = state.copyWith(
        nodeId: '${node['id']}',
        node: node,
      );

  void setSlot({required String id, required String label, required DateTime date}) =>
      state = state.copyWith(slotId: id, slotLabel: label, date: date);

  void setPayment(String code) => state = state.copyWith(paymentMethodCode: code);

  void setPromo(String code) => state = state.copyWith(promoCode: code);

  void setNotes(String notes) => state = state.copyWith(notes: notes);

  /// Après une commande passée : le tunnel repart à zéro.
  void reset() => state = const Checkout();
}

final checkoutProvider =
    StateNotifierProvider<CheckoutNotifier, Checkout>((ref) => CheckoutNotifier());
