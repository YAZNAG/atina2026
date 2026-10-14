import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' hide Category;
import 'package:shared_preferences/shared_preferences.dart';

import '../ai/ai_summary.dart';
import '../data/tender_repository.dart';
import '../i18n/i18n.dart';
import '../models/alert_prefs.dart';
import '../models/filter.dart';
import '../models/tender.dart';
import '../push/device_sync.dart';
import '../push/push_service.dart';

/// État partagé de l'app : avis chargés, recherche, enregistrés, téléchargements,
/// alertes et langue. Les choix de l'utilisateur sont gardés sur le téléphone.
class AppState extends ChangeNotifier {
  AppState({
    TenderRepository? repository,
    PushService? push,
    this.deviceSync,
    this.summaryApi,
  }) : repository = repository ?? DemoTenderRepository(),
       push = push ?? const NoPushService();

  final TenderRepository repository;

  /// Notifications du téléphone et inscription auprès de l'API (absente en démo).
  final PushService push;
  final DeviceSync? deviceSync;

  /// Résumés IA lus sur l'API ; absent en démonstration.
  final AiSummaryApi? summaryApi;
  final Map<String, Future<AiSummaries?>> _aiSummaries = {};

  /// Résumé IA d'un avis, demandé une seule fois par session ; `null` s'il n'y en a
  /// pas (démonstration, IA non configurée, réseau) : la fiche garde son résumé local.
  Future<AiSummaries?> aiSummary(String id) {
    final api = summaryApi;
    if (api == null) return Future.value(null);
    return _aiSummaries.putIfAbsent(id, () async {
      try {
        final s = await api.fetch(id);
        if (s == null) _aiSummaries.remove(id);
        return s;
      } catch (_) {
        // Réseau : on retentera à la prochaine ouverture de la fiche.
        _aiSummaries.remove(id);
        return null;
      }
    });
  }

  SharedPreferences? _prefs;

  List<Tender> tenders = [];
  bool loading = true;

  /// Moment où la liste affichée a été reçue du serveur.
  DateTime? syncedAt;

  /// Serveur injoignable : la dernière liste enregistrée est affichée.
  bool offline = false;

  /// Serveur injoignable et aucune liste enregistrée.
  String? loadError;

  bool get isDemo => repository.isDemo;

  PushPermission pushPermission = PushPermission.unavailable;

  /// Le serveur connaît ce téléphone et lui enverra les alertes.
  bool pushRegistered = false;

  /// Dernière inscription au serveur échouée (réseau) ; retentée au prochain changement.
  String? pushError;

  String? _pushToken;
  Timer? _syncTimer;
  final List<StreamSubscription<Object?>> _subs = [];

  /// Notification touchée : identifiant de l'avis, ou `null` pour la liste.
  final _opened = StreamController<String?>.broadcast();
  Stream<String?> get openRequests => _opened.stream;

  /// Notification reçue pendant que l'app est ouverte.
  final _foreground = StreamController<PushMessage>.broadcast();
  Stream<PushMessage> get foregroundMessages => _foreground.stream;

  bool get wantsPush => alerts.newTenders || alerts.deadlineReminders;
  String lang = 'fr';
  bool onboarded = false;

  String query = '';
  TenderFilter filter = const TenderFilter();

  Set<String> saved = {};
  Map<String, DateTime> downloads = {};
  final Map<String, double> downloading = {};
  AlertPrefs alerts = const AlertPrefs();

  static const _kLang = 'lang';
  static const _kOnboarded = 'onboarded';
  static const _kSaved = 'saved';
  static const _kDownloads = 'downloads';
  static const _kAlerts = 'alerts';

  /// Ne lève jamais : sans stockage, l'app démarre avec les valeurs par défaut.
  Future<void> load() async {
    try {
      _prefs = await SharedPreferences.getInstance();
      final p = _prefs!;
      lang = p.getString(_kLang) == 'ar' ? 'ar' : 'fr';
      onboarded = p.getBool(_kOnboarded) ?? false;
      saved = (p.getStringList(_kSaved) ?? const []).toSet();
      final d = p.getString(_kDownloads);
      if (d != null) {
        final m = jsonDecode(d) as Map<String, dynamic>;
        downloads = {
          for (final e in m.entries)
            if (DateTime.tryParse('${e.value}') != null)
              e.key: DateTime.parse('${e.value}'),
        };
      }
      final a = p.getString(_kAlerts);
      if (a != null) {
        alerts = AlertPrefs.fromJson(jsonDecode(a) as Map<String, dynamic>);
      }
    } catch (_) {
      // Préférences illisibles : on repart des valeurs par défaut.
    }
    I18n.use(lang);
    await refresh();
  }

  Future<void> refresh() async {
    loading = true;
    notifyListeners();
    try {
      final feed = await repository.fetch();
      tenders = feed.tenders;
      syncedAt = feed.syncedAt;
      offline = feed.fromCache;
      loadError = null;
    } catch (e) {
      // On garde la liste déjà affichée, s'il y en a une.
      offline = tenders.isNotEmpty;
      loadError = '$e';
    }
    loading = false;
    notifyListeners();
  }

  Tender? byId(String id) {
    for (final x in tenders) {
      if (x.id == id) return x;
    }
    return null;
  }

  List<Tender> get results => filter.apply(tenders, query);
  List<Tender> get open => tenders.where((x) => x.isOpen).toList();

  int get newCount => open
      .where((x) => DateTime.now().difference(x.publishedAt).inHours < 48)
      .length;
  int get closingSoonCount =>
      open.where((x) => daysUntil(x.deadline) <= 7).length;
  int get alertMatches => open.where(alerts.matches).length;

  /// Avis publiés depuis 48 h qui correspondent aux alertes : le badge de la cloche.
  int get newAlertMatches => open
      .where(
        (x) =>
            alerts.matches(x) &&
            DateTime.now().difference(x.publishedAt).inHours < 48,
      )
      .length;

  List<Tender> get savedTenders =>
      tenders.where((x) => saved.contains(x.id)).toList()
        ..sort((a, b) => a.deadline.compareTo(b.deadline));

  List<Tender> get downloadedTenders =>
      tenders.where((x) => downloads.containsKey(x.id)).toList()
        ..sort((a, b) => downloads[b.id]!.compareTo(downloads[a.id]!));

  int get downloadsSizeKb =>
      downloadedTenders.fold(0, (s, x) => s + x.dossierSizeKb);

  void setQuery(String q) {
    query = q;
    notifyListeners();
  }

  void setFilter(TenderFilter f) {
    filter = f;
    notifyListeners();
  }

  /// Raccourci de l'accueil : une seule catégorie, ou toutes.
  void setCategory(Category? c) =>
      setFilter(filter.copyWith(categories: c == null ? {} : {c}));

  void toggleSaved(String id) {
    saved.contains(id) ? saved.remove(id) : saved.add(id);
    notifyListeners();
    _prefs?.setStringList(_kSaved, saved.toList());
    // Les rappels de date limite portent sur les avis enregistrés.
    _scheduleSync();
  }

  /// Récupère le dossier de consultation pour le consulter hors connexion.
  ///
  /// En démonstration, le transfert est simulé (aucun fichier réel n'existe) ; avec un
  /// serveur, c'est ici que les pièces seront écrites dans le stockage de l'app.
  Future<void> download(String id) async {
    if (downloads.containsKey(id) || downloading.containsKey(id)) return;
    downloading[id] = 0;
    notifyListeners();
    for (var i = 1; i <= 10; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 90));
      downloading[id] = i / 10;
      notifyListeners();
    }
    downloading.remove(id);
    downloads[id] = DateTime.now();
    notifyListeners();
    _saveDownloads();
  }

  void removeDownload(String id) {
    downloads.remove(id);
    notifyListeners();
    _saveDownloads();
  }

  void clearDownloads() {
    downloads.clear();
    notifyListeners();
    _saveDownloads();
  }

  void _saveDownloads() => _prefs?.setString(
    _kDownloads,
    jsonEncode(downloads.map((k, v) => MapEntry(k, v.toIso8601String()))),
  );

  void setAlerts(AlertPrefs a) {
    alerts = a;
    notifyListeners();
    _prefs?.setString(_kAlerts, jsonEncode(a.toJson()));
  }

  void setLanguage(String l) {
    lang = l == 'ar' ? 'ar' : 'fr';
    I18n.use(lang);
    notifyListeners();
    _prefs?.setString(_kLang, lang);
    // Les notifications arrivent dans la langue de l'app.
    _scheduleSync();
  }

  void finishOnboarding() {
    onboarded = true;
    notifyListeners();
    _prefs?.setBool(_kOnboarded, true);
  }

  /// Prépare les notifications au lancement. Ne demande rien à l'utilisateur : la
  /// demande d'autorisation vient à l'enregistrement des alertes. Ne lève jamais.
  Future<void> initPush() async {
    if (isDemo || deviceSync == null || !await push.init()) {
      pushPermission = PushPermission.unavailable;
      notifyListeners();
      return;
    }
    _subs
      ..add(
        push.onTokenRefresh.listen((t) {
          _pushToken = t;
          _syncDevice();
        }),
      )
      ..add(push.onOpened.listen(_open))
      ..add(push.onForeground.listen(_onForeground));
    pushPermission = await push.permission();
    if (pushPermission == PushPermission.granted) {
      _pushToken = await push.token();
      await _syncDevice();
    }
    notifyListeners();
    final launch = await push.launchMessage();
    if (launch != null) _open(launch);
  }

  /// Après l'enregistrement des alertes : demande l'autorisation si des alertes sont
  /// voulues, puis inscrit (ou désinscrit) le téléphone auprès du serveur.
  Future<PushPermission> applyPushPreferences() async {
    if (pushPermission == PushPermission.unavailable) return pushPermission;
    if (wantsPush && pushPermission != PushPermission.granted) {
      pushPermission = await push.requestPermission();
    }
    if (pushPermission == PushPermission.granted) {
      _pushToken ??= await push.token();
    }
    _syncTimer?.cancel();
    await _syncDevice();
    return pushPermission;
  }

  /// Regroupe les changements rapprochés (plusieurs avis enregistrés d'affilée).
  void _scheduleSync() {
    if (_pushToken == null) return;
    _syncTimer?.cancel();
    _syncTimer = Timer(const Duration(seconds: 2), _syncDevice);
  }

  Future<void> _syncDevice() async {
    final token = _pushToken;
    final sync = deviceSync;
    if (token == null || sync == null) return;
    try {
      if (pushPermission == PushPermission.granted && wantsPush) {
        await sync.register(
          token: token,
          platform: push.platform,
          lang: lang,
          prefs: alerts,
          saved: saved,
        );
        pushRegistered = true;
      } else if (pushRegistered || pushPermission == PushPermission.granted) {
        await sync.unregister(token);
        pushRegistered = false;
      }
      pushError = null;
    } catch (e) {
      pushError = '$e';
    }
    notifyListeners();
  }

  void _open(PushMessage m) => _opened.add(m.tenderId);

  void _onForeground(PushMessage m) {
    _foreground.add(m);
    // Une alerte signale de nouveaux avis : on recharge la liste.
    refresh();
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    _opened.close();
    _foreground.close();
    super.dispose();
  }
}
