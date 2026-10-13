import 'package:flutter/material.dart';

import '../i18n/i18n.dart';
import '../state/scope.dart';
import '../widgets/common.dart';
import '../widgets/tender_card.dart';

/// Avis mis de côté, du plus urgent au plus lointain.
class SavedScreen extends StatelessWidget {
  const SavedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final items = AppScope.of(context).savedTenders;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          t('Enregistrés'),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: items.isEmpty
          ? Center(
              child: SingleChildScrollView(
                child: EmptyState(
                  icon: Icons.bookmark_border_rounded,
                  title: t('Aucun avis enregistré'),
                  message: t(
                    "Touchez le marque-page d'un appel d'offres pour le retrouver ici, trié par date limite.",
                  ),
                ),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (_, i) => TenderCard(items[i]),
            ),
    );
  }
}
