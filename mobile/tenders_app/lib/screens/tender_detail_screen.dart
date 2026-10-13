import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../i18n/i18n.dart';
import '../models/tender.dart';
import '../state/scope.dart';
import '../theme/theme.dart';
import '../widgets/common.dart';
import 'assistant_screen.dart';

/// Fiche d'un avis : échéance, informations clés, résumé, lots, pièces du dossier et
/// téléchargement pour consultation hors ligne.
class TenderDetailScreen extends StatelessWidget {
  final String id;
  const TenderDetailScreen({super.key, required this.id});

  static Route<void> route(String id) =>
      MaterialPageRoute(builder: (_) => TenderDetailScreen(id: id));

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final x = state.byId(id);
    if (x == null) {
      return Scaffold(
        appBar: AppBar(),
        body: EmptyState(
          icon: Icons.find_in_page_outlined,
          title: t('Avis introuvable'),
          message: t("Cet appel d'offres n'est plus disponible."),
        ),
      );
    }
    final saved = state.saved.contains(x.id);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          x.reference,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
        actions: [
          IconButton(
            tooltip: t('Copier la référence'),
            icon: const Icon(Icons.copy_rounded),
            onPressed: () {
              Clipboard.setData(
                ClipboardData(text: '${x.reference} — ${x.title}'),
              );
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(SnackBar(content: Text(t('Référence copiée'))));
            },
          ),
          IconButton(
            tooltip: saved ? t('Retirer des enregistrés') : t('Enregistrer'),
            icon: Icon(
              saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
              color: saved ? K.primary : K.ink,
            ),
            onPressed: () => AppScope.read(context).toggleSaved(x.id),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              CategoryPill(x.category),
              Pill(
                label: x.procedure,
                color: K.body,
                background: K.surface,
                icon: Icons.gavel_rounded,
              ),
              if (x.isPrivate)
                Pill(
                  label: t('Privé'),
                  color: K.body,
                  background: K.surface,
                  icon: Icons.business_rounded,
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            x.title,
            style: const TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w800,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(
                Icons.account_balance_outlined,
                size: 16,
                color: K.muted,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  x.buyer,
                  style: const TextStyle(color: K.body, fontSize: 13.5),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _DeadlineCard(x),
          const SizedBox(height: 16),
          _InfoGrid(x),
          const SizedBox(height: 16),
          _Summary(x),
          if (x.lots.isNotEmpty) ...[
            const SizedBox(height: 16),
            Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SectionTitle(t('Lots ({n})', {'n': x.lots.length})),
                  for (final (i, lot) in x.lots.indexed)
                    Padding(
                      padding: EdgeInsets.only(top: i == 0 ? 0 : 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 24,
                            height: 24,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                              color: K.primarySoft,
                              shape: BoxShape.circle,
                            ),
                            child: Text(
                              '${i + 1}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: K.primary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Text(
                                lot,
                                style: const TextStyle(color: K.body),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          _Documents(x),
          const SizedBox(height: 16),
          PrimaryButton(
            outlined: true,
            icon: Icons.auto_awesome,
            label: t("Demander à l'assistant"),
            onPressed: () =>
                Navigator.of(context).push(AssistantScreen.route(about: x)),
          ),
        ],
      ),
      bottomNavigationBar: _DownloadBar(x),
    );
  }
}

class _DeadlineCard extends StatelessWidget {
  final Tender x;
  const _DeadlineCard(this.x);

  @override
  Widget build(BuildContext context) {
    final days = daysUntil(x.deadline);
    final open = x.isOpen;
    final urgent = open && days <= 3;
    final fg = urgent ? K.coral : K.primary;
    final total = x.deadline.difference(x.publishedAt).inMinutes;
    final spent = DateTime.now().difference(x.publishedAt).inMinutes;
    final progress = total <= 0 ? 1.0 : (spent / total).clamp(0.0, 1.0);

    return Panel(
      color: urgent ? K.coralSoft : K.primaryTint,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: fg,
                  borderRadius: BorderRadius.circular(R.md),
                ),
                child: Text(
                  open ? (days <= 0 ? t('J-0') : t('J-{n}', {'n': days})) : '—',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t('Date limite de dépôt'),
                      style: const TextStyle(fontSize: 12, color: K.body),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      fmtDateTime(x.deadline),
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: fg,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(R.pill),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              color: fg,
              backgroundColor: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              spacing: 12,
              runSpacing: 4,
              children: [
                Text(
                  t('Publié le {date}', {'date': fmtDate(x.publishedAt)}),
                  style: const TextStyle(fontSize: 11.5, color: K.body),
                ),
                Text(
                  daysLeftLabel(x.deadline),
                  style: TextStyle(
                    fontSize: 11.5,
                    color: fg,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoGrid extends StatelessWidget {
  final Tender x;
  const _InfoGrid(this.x);

  @override
  Widget build(BuildContext context) {
    final items = [
      (
        Icons.payments_outlined,
        t('Estimation'),
        x.estimate == null ? t('Non communiquée') : fmtMad(x.estimate!),
      ),
      (
        Icons.shield_outlined,
        t('Caution provisoire'),
        x.deposit == null ? t('Non exigée') : fmtMad(x.deposit!),
      ),
      (
        Icons.place_outlined,
        t("Lieu d'exécution"),
        '${bidi(x.city)}\n${bidi(x.region)}',
      ),
      (
        Icons.hourglass_bottom_rounded,
        t("Délai d'exécution"),
        bidi(x.executionDelay),
      ),
      if (x.siteVisit != null)
        (
          Icons.directions_walk_rounded,
          t('Visite des lieux'),
          fmtDateTime(x.siteVisit!),
        ),
      (Icons.tag_rounded, t('Référence'), x.reference),
    ];
    return Panel(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionTitle(t('Informations clés')),
          LayoutBuilder(
            builder: (context, c) {
              final w = (c.maxWidth - 12) / 2;
              return Wrap(
                spacing: 12,
                children: [
                  for (final (icon, label, value) in items)
                    SizedBox(
                      width: w,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(icon, size: 18, color: K.primary),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    label,
                                    style: const TextStyle(
                                      fontSize: 11.5,
                                      color: K.muted,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    value,
                                    style: const TextStyle(
                                      fontSize: 13.5,
                                      fontWeight: FontWeight.w600,
                                      height: 1.3,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  final Tender x;
  const _Summary(this.x);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(R.lg),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFEAF6F2), Color(0xFFF2EFFF)],
        ),
        border: Border.all(color: K.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, size: 18, color: K.primary),
              const SizedBox(width: 8),
              Text(
                t('En bref'),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final line in x.summary)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 7),
                    child: Icon(Icons.circle, size: 5, color: K.primary),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      line,
                      style: const TextStyle(
                        color: K.body,
                        height: 1.45,
                        fontSize: 13.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 4),
          Text(
            t('Résumé automatique : vérifiez toujours le dossier officiel.'),
            style: const TextStyle(
              fontSize: 11,
              color: K.muted,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ),
    );
  }
}

class _Documents extends StatelessWidget {
  final Tender x;
  const _Documents(this.x);

  @override
  Widget build(BuildContext context) {
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionTitle(
            t('Dossier de consultation'),
            trailing: Text(
              fmtSize(x.dossierSizeKb),
              style: const TextStyle(color: K.muted, fontSize: 12.5),
            ),
          ),
          for (final d in x.documents)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: K.bg,
                      borderRadius: BorderRadius.circular(R.sm),
                    ),
                    child: Icon(_iconFor(d.name), size: 19, color: K.body),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      d.name,
                      style: const TextStyle(fontSize: 13, height: 1.3),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    fmtSize(d.sizeKb),
                    style: const TextStyle(fontSize: 12, color: K.muted),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  static IconData _iconFor(String name) {
    if (name.endsWith('.zip')) return Icons.folder_zip_outlined;
    if (name.endsWith('.xlsx')) return Icons.table_chart_outlined;
    return Icons.picture_as_pdf_outlined;
  }
}

class _DownloadBar extends StatelessWidget {
  final Tender x;
  const _DownloadBar(this.x);

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final progress = state.downloading[x.id];
    final done = state.downloads.containsKey(x.id);

    final Widget button;
    if (progress != null) {
      button = Stack(
        alignment: Alignment.center,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(R.md),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 52,
              color: K.primary,
              backgroundColor: K.primarySoft,
            ),
          ),
          Text(
            t('Téléchargement… {p} %', {'p': (progress * 100).round()}),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      );
    } else if (done) {
      button = Row(
        children: [
          const Icon(Icons.offline_pin_rounded, color: K.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  t('Disponible hors ligne'),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                Text(
                  t('Téléchargé {when}', {
                    'when': agoLabel(state.downloads[x.id]!),
                  }),
                  style: const TextStyle(fontSize: 12, color: K.body),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: () => AppScope.read(context).removeDownload(x.id),
            style: TextButton.styleFrom(foregroundColor: K.coral),
            child: Text(t('Supprimer')),
          ),
        ],
      );
    } else {
      button = PrimaryButton(
        icon: Icons.download_rounded,
        label: t('Télécharger le dossier ({size})', {
          'size': fmtSize(x.dossierSizeKb),
        }),
        onPressed: () => AppScope.read(context).download(x.id),
      );
    }

    return Container(
      decoration: const BoxDecoration(
        color: K.surface,
        border: Border(top: BorderSide(color: K.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: SizedBox(height: 52, child: Center(child: button)),
        ),
      ),
    );
  }
}
