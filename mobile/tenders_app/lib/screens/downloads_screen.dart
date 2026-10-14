import 'package:flutter/material.dart';

import '../i18n/i18n.dart';
import '../state/scope.dart';
import '../theme/theme.dart';
import '../widgets/common.dart';
import 'tender_detail_screen.dart';

/// Dossiers téléchargés, consultables sans connexion.
class DownloadsScreen extends StatelessWidget {
  const DownloadsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final items = state.downloadedTenders;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          t('Hors ligne'),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      body: items.isEmpty
          ? Center(
              child: SingleChildScrollView(
                child: EmptyState(
                  icon: Icons.download_for_offline_outlined,
                  title: t('Aucun dossier téléchargé'),
                  message: state.isDemo
                      ? t(
                          "Téléchargez le dossier d'un appel d'offres depuis sa fiche : il restera consultable même sans connexion.",
                        )
                      : t(
                          "La liste des avis reste consultable sans connexion. Les dossiers se téléchargent sur le portail officiel, depuis la fiche de chaque avis.",
                        ),
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              children: [
                Panel(
                  color: K.primaryTint,
                  child: Row(
                    children: [
                      const Icon(Icons.sd_storage_outlined, color: K.primary),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              items.length == 1
                                  ? t('1 dossier')
                                  : t('{n} dossiers', {'n': items.length}),
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                              ),
                            ),
                            Text(
                              t('{size} utilisés sur ce téléphone', {
                                'size': fmtSize(state.downloadsSizeKb),
                              }),
                              style: const TextStyle(
                                fontSize: 12.5,
                                color: K.body,
                              ),
                            ),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: () => _confirmClear(context),
                        style: TextButton.styleFrom(foregroundColor: K.coral),
                        child: Text(t('Tout supprimer')),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                for (final x in items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Material(
                      color: K.surface,
                      borderRadius: BorderRadius.circular(R.lg),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(R.lg),
                        onTap: () => Navigator.of(
                          context,
                        ).push(TenderDetailScreen.route(x.id)),
                        child: Ink(
                          padding: const EdgeInsetsDirectional.fromSTEB(
                            12,
                            12,
                            4,
                            12,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(R.lg),
                            border: Border.all(color: K.line),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 46,
                                height: 46,
                                decoration: BoxDecoration(
                                  color: x.category?.soft ?? K.bg,
                                  borderRadius: BorderRadius.circular(R.md),
                                ),
                                child: Icon(
                                  Icons.folder_rounded,
                                  color: x.category?.color ?? K.body,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      x.title,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 13.5,
                                        height: 1.3,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${x.reference} · ${fmtSize(x.dossierSizeKb)} · ${t('{n} pièces', {'n': x.documents.length})}',
                                      style: const TextStyle(
                                        fontSize: 11.5,
                                        color: K.muted,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    DeadlinePill(x.deadline),
                                  ],
                                ),
                              ),
                              IconButton(
                                tooltip: t('Supprimer'),
                                icon: const Icon(
                                  Icons.delete_outline_rounded,
                                  color: K.muted,
                                ),
                                onPressed: () =>
                                    AppScope.read(context).removeDownload(x.id),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }

  Future<void> _confirmClear(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(t('Supprimer tous les dossiers ?')),
        content: Text(t('Ils ne seront plus consultables hors connexion.')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: Text(t('Annuler')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            style: TextButton.styleFrom(foregroundColor: K.coral),
            child: Text(t('Supprimer')),
          ),
        ],
      ),
    );
    if (ok == true && context.mounted) AppScope.read(context).clearDownloads();
  }
}
