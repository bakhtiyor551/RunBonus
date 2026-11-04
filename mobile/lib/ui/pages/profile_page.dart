import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app_state.dart';
import '../../core/api.dart';
import '../../core/image_pick.dart';
import '../../core/phone.dart';
import '../../core/units.dart';
import '../theme.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/common.dart';
import '../widgets/forms.dart';

String _profileCity(Object? raw) {
  final s = '${raw ?? ''}'.trim();
  return s == 'Не указан' ? '' : s;
}

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  bool _editing = false;
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  String _city = '';
  String? _avatarBase64;
  Uint8List? _avatarPreview;
  bool _saving = false;
  String _error = '';
  int _avatarCacheKey = 0;
  DistanceUnits _units = getDistanceUnits();
  bool _showSettings = false;

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    super.dispose();
  }

  void _startEdit(User user) {
    _firstName.text = '${user['first_name'] ?? ''}';
    _lastName.text = '${user['last_name'] ?? ''}';
    setState(() {
      _city = _profileCity(user['city']);
      _avatarBase64 = null;
      _avatarPreview = null;
      _error = '';
      _editing = true;
    });
  }

  void _cancelEdit() => setState(() {
        _editing = false;
        _avatarBase64 = null;
        _avatarPreview = null;
        _error = '';
      });

  Future<void> _pickPhoto() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Из галереи'),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Сделать фото'),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
        ]),
      ),
    );
    if (source == null) return;
    try {
      final dataUrl = await pickImageDataUrl(source, maxSide: 512);
      if (dataUrl == null || !mounted) return;
      final bytes = dataUrlBytes(dataUrl);
      setState(() {
        _avatarBase64 = dataUrl;
        _avatarPreview = bytes != null ? Uint8List.fromList(bytes) : null;
        _error = '';
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Не удалось обработать фото');
    }
  }

  Future<void> _save() async {
    if (_firstName.text.trim().isEmpty) return setState(() => _error = 'Укажите имя');
    if (_city.trim().isEmpty) return setState(() => _error = 'Выберите город');
    setState(() {
      _saving = true;
      _error = '';
    });
    try {
      final profile = await Api.patch('/api/auth/profile', {
        'firstName': _firstName.text.trim(),
        'lastName': _lastName.text.trim(),
        'city': _city.trim(),
        'avatarBase64': ?_avatarBase64,
      });
      if (!mounted) return;
      if (profile is Map) context.read<AppState>().setUser(Map<String, dynamic>.from(profile));
      setState(() {
        _avatarCacheKey = DateTime.now().millisecondsSinceEpoch;
        _editing = false;
        _avatarBase64 = null;
        _avatarPreview = null;
      });
    } catch (err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Не удалось сохранить'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _setUnits(DistanceUnits u) {
    setDistanceUnits(u);
    setState(() => _units = u);
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final user = state.user ?? const <String, dynamic>{};
    final shoe = user['activeShoe'] as Map?;
    final avatarUrl = Api.mediaUrl(user['avatar_url'] as String?, cacheKey: _avatarCacheKey == 0 ? null : _avatarCacheKey);
    final clientId = user['clientId'] ?? user['client_id'] ?? user['id'];
    final city = _profileCity(user['city']);

    final ImageProvider? avatarImage = _avatarPreview != null
        ? MemoryImage(_avatarPreview!)
        : avatarUrl != null
            ? CachedNetworkImageProvider(avatarUrl)
            : null;

    return TabPage(
      header: const AppHeader(showAvatar: false),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: GestureDetector(
              onTap: _editing ? _pickPhoto : null,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 112,
                    height: 112,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: RB.surfaceHigh,
                      border: Border.all(color: RB.neon, width: 2),
                      image: avatarImage != null ? DecorationImage(image: avatarImage, fit: BoxFit.cover) : null,
                    ),
                    child: avatarImage == null ? const Icon(Icons.person, size: 56, color: RB.neon) : null,
                  ),
                  if (_editing)
                    Positioned(
                      right: -2,
                      bottom: -2,
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: const BoxDecoration(color: RB.neon, shape: BoxShape.circle),
                        child: const Icon(Icons.photo_camera, size: 20, color: RB.onNeon),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          if (_editing) ...[
            LabeledField(label: 'Имя', controller: _firstName, textCapitalization: TextCapitalization.words),
            LabeledField(label: 'Фамилия', controller: _lastName, textCapitalization: TextCapitalization.words),
            CityPicker(value: _city, onChanged: (c) => setState(() => _city = c)),
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(_error, style: RB.body(color: RB.error)),
              ),
            Row(children: [
              Expanded(
                child: PrimaryButton(label: _saving ? 'Сохранение…' : 'Сохранить', compact: true, loading: _saving, onPressed: _save),
              ),
              const SizedBox(width: 10),
              OutlineButtonRB(label: 'Отмена', onPressed: _saving ? null : _cancelEdit),
            ]),
          ] else ...[
            Text('${user['name'] ?? 'Пользователь'}', textAlign: TextAlign.center, style: RB.headline(size: 26)),
            const SizedBox(height: 4),
            Text(formatPhoneDisplay(user['phone'] as String?), textAlign: TextAlign.center, style: RB.body(color: RB.onSurfaceVariant)),
            if (clientId != null) ...[
              const SizedBox(height: 10),
              Text.rich(
                TextSpan(children: [
                  const TextSpan(text: 'ID КЛИЕНТА: '),
                  TextSpan(text: 'RB-$clientId', style: RB.label(size: 12, color: RB.neon)),
                ]),
                textAlign: TextAlign.center,
                style: RB.label(size: 12),
              ),
            ],
            if (user['email'] != null) ...[
              const SizedBox(height: 4),
              Text('${user['email']}', textAlign: TextAlign.center, style: RB.body(color: RB.onSurfaceVariant)),
            ],
            if (city.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(city, textAlign: TextAlign.center, style: RB.body(color: RB.onSurfaceVariant)),
            ],
            Center(
              child: TextButton(
                onPressed: () => _startEdit(user),
                child: Text('Редактировать профиль', style: RB.body(weight: FontWeight.w600, color: RB.neon)),
              ),
            ),
            const SizedBox(height: 16),
            Text('👟 МОИ КРОССОВКИ', style: RB.label()),
            const SizedBox(height: 12),
            GlassCard(
              child: shoe != null
                  ? Row(children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(color: RB.surfaceHigh, borderRadius: BorderRadius.circular(12)),
                        child: const Icon(Icons.directions_run, color: RB.neon),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${shoe['model_name'] ?? 'Кроссовки'}', style: RB.headline(size: 17)),
                          const SizedBox(height: 4),
                          Text('${shoe['unique_id'] ?? ''}', style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                        ]),
                      ),
                    ])
                  : Text('Кроссовки не активированы', style: RB.body(color: RB.onSurfaceVariant)),
            ),
            const SizedBox(height: 16),
            _MenuButton(icon: Icons.directions_run, label: 'Моя активность', onTap: () => context.go('/workouts')),
            _MenuButton(icon: Icons.redeem, label: 'Мои награды', onTap: () => context.go('/my-rewards')),
            _MenuButton(icon: Icons.shopping_bag_outlined, label: 'Мои заказы', onTap: () => context.go('/orders')),
            _MenuButton(icon: Icons.settings_outlined, label: 'Настройки', onTap: () => setState(() => _showSettings = !_showSettings)),
            if (_showSettings) ...[
              const SizedBox(height: 8),
              Text('ЕДИНИЦЫ ИЗМЕРЕНИЯ', style: RB.label()),
              const SizedBox(height: 12),
              SegmentedButton<DistanceUnits>(
                segments: const [
                  ButtonSegment(value: DistanceUnits.metric, label: Text('км / км·ч')),
                  ButtonSegment(value: DistanceUnits.imperial, label: Text('мили / mph')),
                ],
                selected: {_units},
                showSelectedIcon: false,
                onSelectionChanged: (s) => _setUnits(s.first),
                style: SegmentedButton.styleFrom(
                  selectedBackgroundColor: RB.neon,
                  selectedForegroundColor: RB.onNeon,
                ),
              ),
              const SizedBox(height: 12),
              _MenuButton(
                icon: Icons.policy_outlined,
                label: 'Политика конфиденциальности',
                trailing: Icons.open_in_new,
                onTap: () => launchUrl(Uri.parse('https://runbonus.online/privacy/'), mode: LaunchMode.externalApplication),
              ),
              const SizedBox(height: 8),
            ],
            _MenuButton(icon: Icons.logout, label: 'Выйти', danger: true, onTap: state.logout),
          ],
        ],
      ),
    );
  }
}

class _MenuButton extends StatelessWidget {
  const _MenuButton({required this.icon, required this.label, required this.onTap, this.danger = false, this.trailing});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;
  final IconData? trailing;

  @override
  Widget build(BuildContext context) {
    final color = danger ? RB.error : RB.onSurface;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        onTap: onTap,
        borderColor: danger ? RB.error : null,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Row(children: [
          Icon(icon, color: danger ? RB.error : RB.neon),
          const SizedBox(width: 14),
          Expanded(child: Text(label, style: RB.body(size: 15, weight: FontWeight.w600, color: color))),
          if (!danger) Icon(trailing ?? Icons.chevron_right, color: RB.onSurfaceVariant),
        ]),
      ),
    );
  }
}
