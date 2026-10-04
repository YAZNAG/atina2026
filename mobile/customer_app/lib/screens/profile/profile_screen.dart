import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../i18n/i18n.dart';
import '../../services/auth_service.dart';
import '../../services/profile_service.dart';
import '../../theme/atina.dart';
import '../../theme/widgets.dart';

/// Mon compte : carte client (points et portefeuille), commandes, récompenses,
/// assistance et réglages.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic> _profile = const {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final profile = await ProfileService.get();
      if (mounted) setState(() => _profile = profile);
    } catch (_) {
      // La page reste utilisable sans le détail du compte.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: C.bg,
        title: Text(t('Déconnexion'), style: ts(16, weight: F.bold)),
        content: Text(t('Voulez-vous vous déconnecter ?'), style: ts(14, color: C.body)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(t('Annuler'), style: ts(14, color: C.grey)),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(t('Déconnexion'), style: ts(14, weight: F.semi, color: C.red)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await AuthService.logout();
    if (mounted) context.go('/auth/login');
  }

  @override
  Widget build(BuildContext context) {
    // `/customer/me` pose le solde, le portefeuille et le code de parrainage à la
    // racine ; l'objet « customer » n'existe que sur la réponse de connexion.
    final customer = {
      ...?(_profile['customer'] as Map?)?.cast<String, dynamic>(),
      ..._profile,
    };
    final name = (_profile['name'] as String?) ?? '';
    final avatar = _profile['avatar_url'] as String?;

    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          ScreenHeader(title: t('Mon Compte')),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: C.red))
                : RefreshIndicator(
                    color: C.red,
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(S.lg, S.sm, S.lg, 120),
                      children: [
                        _header(name, avatar, customer),
                        const SizedBox(height: S.lg),
                        _section(t('COMMANDES'), [
                          _Row(Icons.receipt_long_outlined, t('Historique des commandes'),
                              () => context.push('/order/orders')),
                          _Row(Icons.my_location, t('Ma localisation'),
                              () => context.push('/profile/location')),
                          _Row(Icons.location_on_outlined, t('Mes adresses'),
                              () => context.push('/profile/addresses')),
                          _Row(Icons.favorite_border, t('Mes favoris'),
                              () => context.push('/main/favorites')),
                        ]),
                        _section(t('Promotions & Récompenses'), [
                          _Row(Icons.stars_outlined, t('Mes points fidélité'),
                              () => context.push('/profile/loyalty')),
                          _Row(Icons.account_balance_wallet_outlined, t('Wallet'),
                              () => context.push('/profile/wallet')),
                          _Row(Icons.confirmation_number_outlined, t('Mes coupons'),
                              () => context.push('/profile/coupons')),
                          _Row(Icons.swap_horiz, t('Échanger mes points'),
                              () => context.push('/rewards/exchange')),
                          _Row(Icons.casino_outlined, t('Jeux'), () => context.push('/games')),
                          _Row(Icons.emoji_events_outlined, t('Mes gains'),
                              () => context.push('/games/prizes')),
                        ]),
                        _section(t("Centre d'aide"), [
                          _Row(Icons.chat_bubble_outline, t('Chat avec le support'),
                              () => context.push('/support/conversations')),
                          _Row(Icons.help_outline, t('FAQ'), () => context.push('/support/faq')),
                          _Row(Icons.report_problem_outlined, t('Réclamation'),
                              () => context.push('/claims')),
                          _Row(Icons.headset_mic_outlined, t('Contact'),
                              () => context.push('/support/contact')),
                        ]),
                        _section(t('Paramètres'), [
                          _Row(Icons.person_outline, t('Modifier profil'),
                              () => context.push('/profile/edit')),
                          _Row(Icons.notifications_none, t('Notifications'),
                              () => context.push('/profile/notifications')),
                          _Row(Icons.language, t('Langue'), () => context.push('/profile/language')),
                          if ((customer['referral_code'] as String?)?.isNotEmpty == true)
                            _Row(
                              Icons.group_add_outlined,
                              '${t('Parrainer un ami')} · ${customer['referral_code']}',
                              () async {
                                await Clipboard.setData(
                                  ClipboardData(text: '${customer['referral_code']}'),
                                );
                                if (!context.mounted) return;
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(t('Copié !'),
                                        style: ts(13.5, color: Colors.white)),
                                    backgroundColor: C.ink,
                                    behavior: SnackBarBehavior.floating,
                                  ),
                                );
                              },
                            ),
                          _Row(Icons.delete_outline, t('Supprimer mon compte'),
                              () => context.push('/profile/delete-account')),
                        ]),
                        const SizedBox(height: S.lg),
                        OutlinedButton.icon(
                          onPressed: _logout,
                          icon: const Icon(Icons.logout, size: 18, color: C.red),
                          label: Text(t('Déconnexion'),
                              style: ts(14, weight: F.semi, color: C.red)),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(50),
                            side: const BorderSide(color: C.red),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(R.md),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _header(String name, String? avatar, Map<String, dynamic> customer) {
    final points = (customer['points_balance'] as num?) ?? 0;
    final wallet = (customer['wallet_balance'] as num?) ?? 0;

    return Container(
      padding: const EdgeInsets.all(S.lg),
      decoration: BoxDecoration(
        color: C.red,
        borderRadius: BorderRadius.circular(R.lg),
        boxShadow: buttonShadow,
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 54,
                height: 54,
                clipBehavior: Clip.antiAlias,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: avatar != null && avatar.isNotEmpty
                    ? Image.network(Config.media(avatar), fit: BoxFit.cover,
                        width: 54, height: 54)
                    : Text(
                        name.isEmpty ? '?' : name.characters.first.toUpperCase(),
                        style: ts(22, weight: F.bold, color: Colors.white),
                      ),
              ),
              const SizedBox(width: S.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      name.isEmpty ? t('Client') : name,
                      style: ts(17, weight: F.bold, color: Colors.white),
                    ),
                    Text(
                      '${_profile['phone_country'] ?? ''} ${_profile['phone_number'] ?? ''}',
                      style: ts(12.5, color: Colors.white.withValues(alpha: 0.85)),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => context.push('/profile/edit'),
                icon: const Icon(Icons.edit_outlined, color: Colors.white, size: 20),
                tooltip: t('Modifier profil'),
              ),
            ],
          ),
          const SizedBox(height: S.md),
          Row(
            children: [
              Expanded(
                child: _stat(t('POINTS'), fmtNumber(points, digits: 0)),
              ),
              Container(width: 1, height: 34, color: Colors.white24),
              Expanded(child: _stat(t('Wallet'), fmtPrice(wallet))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _stat(String label, String value) => Column(
        children: [
          Text(value, style: ts(17, weight: F.black, color: Colors.white)),
          Text(label,
              style: ts(11, color: Colors.white.withValues(alpha: 0.85))),
        ],
      );

  Widget _section(String title, List<_Row> rows) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, S.lg, 4, S.sm),
            child: Text(title, style: ts(12, weight: F.semi, color: C.grey)),
          ),
          // Material et non Container : les ListTile peignent leur fond et leur
          // encre sur le Material le plus proche, qu'un simple fond masquerait.
          Material(
            color: C.bg,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(R.md),
              side: const BorderSide(color: C.line),
            ),
            child: Column(
              children: [
                for (var i = 0; i < rows.length; i++) ...[
                  rows[i],
                  if (i != rows.length - 1) const Divider(height: 1, indent: 52),
                ],
              ],
            ),
          ),
        ],
      );
}

class _Row extends StatelessWidget {
  const _Row(this.icon, this.label, this.onTap);

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: Icon(icon, size: 20, color: C.red),
      title: Text(label, style: ts(14)),
      trailing: const Icon(Icons.chevron_right, size: 20, color: C.greyLight),
      dense: true,
    );
  }
}
