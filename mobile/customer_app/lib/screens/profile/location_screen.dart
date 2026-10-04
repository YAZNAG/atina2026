import 'package:flutter/material.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../core/prefs.dart';
import '../../i18n/i18n.dart';
import '../../services/catalog_service.dart';
import '../../services/profile_service.dart';
import '../../theme/atina.dart';
import '../../theme/widgets.dart';
import '../../widgets/select_sheet.dart';

/// Maquette « Ma localisation » : position actuelle, ville, point de
/// distribution et adresse de livraison par défaut, réunis sur un seul écran.
///
/// Les mêmes choix existaient jusqu'ici éclatés entre « Complétez votre profil »
/// et « Mes adresses » ; cet écran les regroupe comme le prévoit le Figma.
class LocationScreen extends StatefulWidget {
  const LocationScreen({super.key});

  @override
  State<LocationScreen> createState() => _LocationScreenState();
}

class _LocationScreenState extends State<LocationScreen> {
  List<Map<String, dynamic>> _cities = const [];
  List<Map<String, dynamic>> _nodes = const [];
  List<Map<String, dynamic>> _addresses = const [];

  String? _cityId;
  String? _cityName;
  String? _nodeId;
  String _position = '';
  bool _loading = true;
  bool _locating = false;
  bool _saving = false;
  String _message = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    _nodeId = NodePref.get();
    await Future.wait([
      CatalogService.cities()
          .then((v) => mounted ? setState(() => _cities = v) : null)
          .catchError((Object _) {}),
      ProfileService.get().then((profil) {
        if (!mounted) return;
        final ville = profil['city'] as String?;
        setState(() => _cityName = ville);
      }).catchError((Object _) {}),
      ProfileService.addresses()
          .then((v) => mounted ? setState(() => _addresses = v) : null)
          .catchError((Object _) {}),
    ]);

    // Ville connue : on retrouve son identifiant pour charger les magasins.
    final ville = _cities.where((c) => '${c['name_fr']}' == _cityName);
    if (ville.isNotEmpty) await _selectCity('${ville.first['id']}');

    if (mounted) setState(() => _loading = false);
  }

  Future<void> _selectCity(String id) async {
    final ville = _cities.where((c) => '${c['id']}' == id);
    setState(() {
      _cityId = id;
      _cityName = ville.isNotEmpty ? '${ville.first['name_fr']}' : _cityName;
      _nodes = const [];
      _message = '';
    });
    try {
      final list = await CatalogService.nodes(id);
      if (!mounted) return;
      setState(() {
        _nodes = list;
        // Le point enregistré n'appartient plus à cette ville : on repart à zéro.
        if (!list.any((n) => '${n['id']}' == _nodeId)) {
          _nodeId = list.length == 1 ? '${list.first['id']}' : null;
        }
      });
    } catch (_) {
      if (mounted) setState(() => _nodes = const []);
    }
  }

  Future<void> _locate() async {
    setState(() {
      _locating = true;
      _message = '';
    });
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        setState(() =>
            _message = t('Autorisez la localisation pour utiliser votre position.'));
        return;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      var resume = t('Position enregistrée');
      try {
        final places =
            await placemarkFromCoordinates(position.latitude, position.longitude);
        if (places.isNotEmpty) {
          final place = places.first;
          final parts = [
            [place.subThoroughfare, place.thoroughfare].whereType<String>().join(' ').trim(),
            place.subLocality,
            place.locality,
          ].whereType<String>().where((s) => s.isNotEmpty).toList();
          if (parts.isNotEmpty) resume = parts.join(', ');

          // La ville détectée est sélectionnée si elle fait partie du réseau.
          final ville = _cities.where(
            (c) => '${c['name_fr']}'.toLowerCase() == (place.locality ?? '').toLowerCase(),
          );
          if (ville.isNotEmpty) await _selectCity('${ville.first['id']}');
        }
      } catch (_) {
        // Géocodage inverse facultatif.
      }
      if (mounted) setState(() => _position = resume);
    } catch (_) {
      setState(() =>
          _message = t("Impossible d'obtenir votre position. Vérifiez que le GPS est activé."));
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _message = '';
    });
    try {
      if (_cityId != null) {
        await ProfileService.update({'city_id': _cityId});
      }
      await NodePref.set(_nodeId);
      if (mounted) setState(() => _message = t('Modifications enregistrées'));
    } catch (e) {
      if (mounted) setState(() => _message = '$e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Map<String, dynamic>? get _node {
    final trouve = _nodes.where((n) => '${n['id']}' == _nodeId);
    return trouve.isEmpty ? null : trouve.first;
  }

  Map<String, dynamic>? get _defaultAddress {
    final def = _addresses.where((a) => a['is_default'] == true);
    if (def.isNotEmpty) return def.first;
    return _addresses.isEmpty ? null : _addresses.first;
  }

  @override
  Widget build(BuildContext context) {
    final adresse = _defaultAddress;

    return Scaffold(
      backgroundColor: C.bg,
      body: Column(
        children: [
          ScreenHeader(
            title: t('Ma localisation'),
            onBack: () => context.canPop() ? context.pop() : context.go('/main/home'),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: C.red))
                : ListView(
                    padding: const EdgeInsets.fromLTRB(S.lg, S.sm, S.lg, 120),
                    children: [
                      // Position actuelle
                      Container(
                        padding: const EdgeInsets.all(S.md),
                        decoration: BoxDecoration(
                          color: C.redTint,
                          borderRadius: BorderRadius.circular(R.lg),
                          border: Border.all(color: C.redSoft),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Image.asset('assets/images/atina/pin.png',
                                    width: 28, height: 28),
                                const SizedBox(width: S.sm),
                                Expanded(
                                  child: Text(t('Adresse actuelle'),
                                      style: ts(14.5, weight: F.bold)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _position.isNotEmpty
                                  ? _position
                                  : t('Utilisez votre position pour trouver le magasin le plus proche.'),
                              style: ts(13, color: C.body, height: 1.45),
                            ),
                            const SizedBox(height: S.md),
                            OutlinedButton.icon(
                              onPressed: _locating ? null : _locate,
                              icon: _locating
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2, color: C.red),
                                    )
                                  : const Icon(Icons.my_location, size: 18, color: C.red),
                              label: Text(
                                t('Utiliser ma position actuelle'),
                                style: ts(13.5, weight: F.semi, color: C.red),
                              ),
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size.fromHeight(46),
                                backgroundColor: C.bg,
                                side: const BorderSide(color: C.red),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(R.md),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: S.xl),

                      // Ville
                      Text(t('Choisir une ville'), style: ts(13, weight: F.semi)),
                      const SizedBox(height: S.sm),
                      _Selector(
                        icon: Icons.location_city_outlined,
                        text: _cityName ?? t('Sélectionnez votre ville'),
                        empty: _cityName == null,
                        onTap: () => SelectSheet.show(
                          context,
                          title: t('Choisir une ville'),
                          options: _cities
                              .map((c) => SelectOption('${c['id']}', tName(c),
                                  hint: c['postal_code'] as String?))
                              .toList(),
                          selected: _cityId,
                          onSelect: _selectCity,
                        ),
                      ),
                      const SizedBox(height: S.lg),

                      // Point de distribution
                      Text(t('Point de distribution le plus proche'),
                          style: ts(13, weight: F.semi)),
                      const SizedBox(height: S.sm),
                      _Selector(
                        icon: Icons.storefront_outlined,
                        text: _node != null
                            ? tName(_node)
                            : _cityId != null
                                ? t('Sélectionnez un point de distribution')
                                : t("Sélectionnez d'abord une ville"),
                        empty: _node == null,
                        disabled: _cityId == null,
                        onTap: _cityId == null
                            ? null
                            : () => SelectSheet.show(
                                  context,
                                  title: t('Point de distribution le plus proche'),
                                  options: _nodes
                                      .map((n) => SelectOption('${n['id']}', tName(n),
                                          hint: n['address_line1'] as String?))
                                      .toList(),
                                  selected: _nodeId,
                                  emptyText: t(
                                      'Aucun point de distribution dans cette ville pour le moment.'),
                                  onSelect: (v) => setState(() => _nodeId = v),
                                ),
                      ),
                      const SizedBox(height: S.xl),

                      // Adresse de livraison par défaut
                      Row(
                        children: [
                          Expanded(
                            child: Text(t('Adresse de livraison'),
                                style: ts(13, weight: F.semi)),
                          ),
                          TextButton(
                            onPressed: () => context.push('/profile/addresses'),
                            child: Text(t('Gérer'),
                                style: ts(13, weight: F.semi, color: C.red)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.all(S.md),
                        decoration: BoxDecoration(
                          color: C.bg,
                          borderRadius: BorderRadius.circular(R.md),
                          border: Border.all(color: C.line),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.home_outlined, size: 20, color: C.red),
                            const SizedBox(width: S.md),
                            Expanded(
                              child: Text(
                                adresse == null
                                    ? t('Ajoutez une adresse pour être livré.')
                                    : [
                                        adresse['street_name'],
                                        adresse['quartier'],
                                        adresse['city'],
                                      ]
                                        .whereType<String>()
                                        .where((s) => s.isNotEmpty)
                                        .join(', '),
                                style: ts(13.5,
                                    color: adresse == null ? C.grey : C.ink, height: 1.4),
                              ),
                            ),
                          ],
                        ),
                      ),

                      if (_message.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: S.md),
                          child: Text(
                            _message,
                            style: ts(12.5,
                                weight: F.medium,
                                color: _message == t('Modifications enregistrées')
                                    ? C.green
                                    : C.red),
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
              label: t('Confirmer'),
              loading: _saving,
              onPressed: _nodeId == null ? null : _save,
            ),
          ),
        ],
      ),
    );
  }
}

class _Selector extends StatelessWidget {
  const _Selector({
    required this.icon,
    required this.text,
    required this.empty,
    this.onTap,
    this.disabled = false,
  });

  final IconData icon;
  final String text;
  final bool empty;
  final VoidCallback? onTap;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(R.md),
      child: Container(
        height: 52,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: disabled ? const Color(0xFFFAFAFA) : C.bg,
          borderRadius: BorderRadius.circular(R.md),
          border: Border.all(color: C.line),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: const Color(0xFF6B6B6B)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ts(14, color: empty ? const Color(0xFFA0A0A0) : C.ink),
              ),
            ),
            const Icon(Icons.keyboard_arrow_down, size: 20, color: Color(0xFF6B6B6B)),
          ],
        ),
      ),
    );
  }
}
