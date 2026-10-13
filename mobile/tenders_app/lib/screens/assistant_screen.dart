import 'package:flutter/material.dart';

import '../data/assistant.dart';
import '../i18n/i18n.dart';
import '../models/tender.dart';
import '../state/scope.dart';
import '../theme/theme.dart';
import 'tender_detail_screen.dart';

class _Message {
  final bool fromUser;
  final String text;
  final List<Tender> tenders;
  const _Message(this.fromUser, this.text, [this.tenders = const []]);
}

/// Assistant de recherche : une demande en langage courant, une réponse avec les avis
/// correspondants. Ouvert depuis une fiche ([about]), il commence par la résumer.
class AssistantScreen extends StatefulWidget {
  final Tender? about;
  const AssistantScreen({super.key, this.about});

  static Route<void> route({Tender? about}) =>
      MaterialPageRoute(builder: (_) => AssistantScreen(about: about));

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<_Message> _messages = [];
  bool _started = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _start() {
    if (_started) return;
    _started = true;
    final about = widget.about;
    if (about != null) {
      final reply = SearchAssistant(
        AppScope.read(context).tenders,
      ).answer('', about: about);
      _messages
        ..add(
          _Message(
            true,
            t('Résume cet appel d\'offres : {ref}', {'ref': about.reference}),
          ),
        )
        ..add(_Message(false, reply.text));
    }
  }

  void _send([String? preset]) {
    final text = (preset ?? _input.text).trim();
    if (text.isEmpty) return;
    final reply = SearchAssistant(AppScope.read(context).tenders).answer(text);
    setState(() {
      _messages
        ..add(_Message(true, preset == null ? text : t(preset)))
        ..add(_Message(false, reply.text, reply.tenders));
      _input.clear();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    _start();
    // Le libellé est traduit ; la requête envoyée reste celle que l'assistant comprend.
    const suggestions = [
      'Travaux à Marrakech',
      'Services qui clôturent cette semaine',
      'Fournitures de plus de 5 millions',
      "Nouveaux appels d'offres",
      'Consultations du secteur privé',
    ];

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [K.primary, Color(0xFF6D5BD0)],
                ),
                borderRadius: BorderRadius.circular(11),
              ),
              child: const Icon(
                Icons.auto_awesome,
                color: Colors.white,
                size: 18,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    t('Assistant'),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 17,
                    ),
                  ),
                  Text(
                    t('Fonctionne hors ligne'),
                    style: const TextStyle(fontSize: 11.5, color: K.muted),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (_messages.isNotEmpty && widget.about == null)
            IconButton(
              tooltip: t('Nouvelle conversation'),
              icon: const Icon(Icons.refresh_rounded),
              onPressed: () => setState(_messages.clear),
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      const SizedBox(height: 20),
                      Center(
                        child: Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [K.primary, Color(0xFF6D5BD0)],
                            ),
                            borderRadius: BorderRadius.circular(24),
                          ),
                          child: const Icon(
                            Icons.auto_awesome,
                            color: Colors.white,
                            size: 34,
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        t('Que cherchez-vous ?'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        t(
                          'Décrivez le marché voulu : secteur, ville, délai, budget. Je vous montre les avis ouverts qui correspondent.',
                        ),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: K.body, height: 1.45),
                      ),
                      const SizedBox(height: 22),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final s in suggestions)
                            ActionChip(
                              label: Text(t(s)),
                              onPressed: () => _send(s),
                              backgroundColor: K.surface,
                              side: const BorderSide(color: K.line),
                              labelStyle: const TextStyle(
                                color: K.primaryDark,
                                fontWeight: FontWeight.w600,
                              ),
                              avatar: const Icon(
                                Icons.north_east_rounded,
                                size: 15,
                                color: K.primary,
                              ),
                            ),
                        ],
                      ),
                    ],
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) => _Bubble(_messages[i]),
                  ),
          ),
          Container(
            decoration: const BoxDecoration(
              color: K.surface,
              border: Border(top: BorderSide(color: K.line)),
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _input,
                        onSubmitted: (_) => _send(),
                        textInputAction: TextInputAction.send,
                        decoration: InputDecoration(
                          hintText: t('Ex. : travaux de voirie à Agadir'),
                          hintStyle: const TextStyle(
                            color: K.muted,
                            fontSize: 14,
                          ),
                          filled: true,
                          fillColor: K.bg,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(R.pill),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      tooltip: t('Envoyer'),
                      style: IconButton.styleFrom(backgroundColor: K.primary),
                      onPressed: _send,
                      icon: const Icon(Icons.arrow_upward_rounded),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final _Message m;
  const _Bubble(this.m);

  @override
  Widget build(BuildContext context) {
    final user = m.fromUser;
    return Align(
      alignment: user
          ? AlignmentDirectional.centerEnd
          : AlignmentDirectional.centerStart,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * (user ? 0.78 : 0.9),
        ),
        child: Column(
          crossAxisAlignment: user
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              decoration: BoxDecoration(
                color: user ? K.primary : K.surface,
                border: user ? null : Border.all(color: K.line),
                borderRadius: BorderRadiusDirectional.only(
                  topStart: const Radius.circular(18),
                  topEnd: const Radius.circular(18),
                  bottomStart: Radius.circular(user ? 18 : 4),
                  bottomEnd: Radius.circular(user ? 4 : 18),
                ),
              ),
              child: Text(
                m.text,
                style: TextStyle(
                  color: user ? Colors.white : K.ink,
                  height: 1.45,
                  fontSize: 14,
                ),
              ),
            ),
            for (final x in m.tenders)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Material(
                  color: K.surface,
                  borderRadius: BorderRadius.circular(R.md),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(R.md),
                    onTap: () => Navigator.of(
                      context,
                    ).push(TenderDetailScreen.route(x.id)),
                    child: Ink(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(R.md),
                        border: Border.all(color: K.line),
                      ),
                      child: Row(
                        children: [
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
                                    fontSize: 13,
                                    height: 1.3,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${x.city} · ${daysLeftLabel(x.deadline)}'
                                  '${x.estimate == null ? '' : ' · ${fmtMadShort(x.estimate!)}'}',
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    color: K.muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(
                            Icons.chevron_right_rounded,
                            color: K.muted,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
