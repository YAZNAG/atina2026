import 'package:flutter/material.dart';

import '../i18n/i18n.dart';
import '../models/tender.dart';
import '../screens/tender_detail_screen.dart';
import '../state/scope.dart';
import '../theme/theme.dart';
import 'common.dart';

/// Carte d'un avis dans les listes : catégorie et échéance, objet, acheteur, lieu,
/// montant estimé, et accès direct à l'enregistrement.
class TenderCard extends StatelessWidget {
  final Tender tender;
  const TenderCard(this.tender, {super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final x = tender;
    final saved = state.saved.contains(x.id);
    final downloaded = state.downloads.containsKey(x.id);

    return Material(
      color: K.surface,
      borderRadius: BorderRadius.circular(R.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(R.lg),
        onTap: () => Navigator.of(context).push(TenderDetailScreen.route(x.id)),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(R.lg),
            border: Border.all(color: K.line),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 8, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 8),
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (x.isPurchaseOrder)
                        Pill(
                          label: t('Bon de commande'),
                          color: K.amber,
                          background: K.amberSoft,
                          icon: Icons.receipt_long_outlined,
                        ),
                      if (x.category != null) CategoryPill(x.category!),
                      DeadlinePill(x.deadline),
                      if (x.isPrivate)
                        Pill(
                          label: t('Privé'),
                          color: K.body,
                          background: K.bg,
                          icon: Icons.business_rounded,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 8),
                  child: Text(
                    x.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      height: 1.35,
                      color: K.ink,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                _Meta(icon: Icons.account_balance_outlined, text: x.buyer),
                const SizedBox(height: 4),
                _Meta(
                  icon: Icons.place_outlined,
                  text: '${x.city} · ${t('Limite')} ${fmtDate(x.deadline)}',
                ),
                const SizedBox(height: 10),
                const Divider(),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            t('Estimation'),
                            style: const TextStyle(
                              fontSize: 11,
                              color: K.muted,
                            ),
                          ),
                          Text(
                            x.estimate == null
                                ? t('Non communiquée')
                                : fmtMadShort(x.estimate!),
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: K.ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (downloaded)
                      Tooltip(
                        message: t('Disponible hors ligne'),
                        child: const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 6),
                          child: Icon(
                            Icons.offline_pin_rounded,
                            color: K.primary,
                            size: 20,
                          ),
                        ),
                      ),
                    Text(
                      x.reference,
                      style: const TextStyle(fontSize: 11, color: K.muted),
                    ),
                    IconButton(
                      tooltip: saved
                          ? t('Retirer des enregistrés')
                          : t('Enregistrer'),
                      onPressed: () => AppScope.read(context).toggleSaved(x.id),
                      icon: Icon(
                        saved
                            ? Icons.bookmark_rounded
                            : Icons.bookmark_border_rounded,
                        color: saved ? K.primary : K.muted,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Meta({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 15, color: K.muted),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12.5, color: K.body),
          ),
        ),
      ],
    );
  }
}
