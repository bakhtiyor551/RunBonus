import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme.dart';

class BoltIcon extends StatelessWidget {
  const BoltIcon({super.key, this.size = 28, this.glow = false});
  final double size;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.bolt,
      size: size,
      color: RB.neon,
      shadows: glow ? [Shadow(color: RB.neon.withValues(alpha: 0.45), blurRadius: 16)] : null,
    );
  }
}

class CircleIconButton extends StatelessWidget {
  const CircleIconButton({super.key, required this.icon, required this.onTap, this.size = 40, this.tooltip});
  final IconData icon;
  final VoidCallback? onTap;
  final double size;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final button = Material(
      color: RB.surfaceHighest,
      shape: CircleBorder(side: BorderSide(color: RB.outline.withValues(alpha: 0.3))),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox.square(dimension: size, child: Icon(icon, color: RB.neon, size: size * 0.55)),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}

/// Шапка страницы: логотип или «назад», справа — профиль или произвольный бейдж.
class AppHeader extends StatelessWidget implements PreferredSizeWidget {
  const AppHeader({super.key, this.showAvatar = true, this.trailing, this.onBack, this.title});
  final bool showAvatar;
  final Widget? trailing;
  final VoidCallback? onBack;
  final String? title;

  @override
  Size get preferredSize => const Size.fromHeight(72);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 16, 20, 16),
      decoration: BoxDecoration(
        color: RB.bg.withValues(alpha: 0.95),
        border: Border(bottom: BorderSide(color: RB.outline.withValues(alpha: 0.2))),
      ),
      child: Row(
        children: [
          if (onBack != null)
            CircleIconButton(icon: Icons.arrow_back, onTap: onBack, tooltip: 'Назад')
          else ...[
            const BoltIcon(),
            const SizedBox(width: 8),
            Text('RUNBONUS', style: RB.headline(size: 22, color: RB.neon)),
          ],
          if (title != null) ...[
            const SizedBox(width: 12),
            Expanded(child: Text(title!, style: RB.headline(size: 20), overflow: TextOverflow.ellipsis)),
          ] else
            const Spacer(),
          ?trailing,
          if (trailing == null && showAvatar)
            CircleIconButton(icon: Icons.person, onTap: () => context.go('/profile'), tooltip: 'Профиль'),
        ],
      ),
    );
  }
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.icon, this.loading = false, this.compact = false});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    return SizedBox(
      width: compact ? null : double.infinity,
      child: FilledButton(
        onPressed: enabled ? onPressed : null,
        style: FilledButton.styleFrom(
          backgroundColor: RB.neon,
          foregroundColor: RB.onNeon,
          disabledBackgroundColor: RB.neon.withValues(alpha: 0.35),
          disabledForegroundColor: RB.onNeon.withValues(alpha: 0.7),
          padding: compact ? const EdgeInsets.symmetric(horizontal: 20, vertical: 12) : const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(compact ? 999 : RB.radiusLg)),
          textStyle: RB.headline(size: compact ? 14 : 18),
        ),
        child: loading
            ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: RB.onNeon))
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[Icon(icon, size: compact ? 18 : 22), const SizedBox(width: 8)],
                  Flexible(child: Text(compact ? label : label.toUpperCase(), overflow: TextOverflow.ellipsis)),
                ],
              ),
      ),
    );
  }
}

class OutlineButtonRB extends StatelessWidget {
  const OutlineButtonRB({super.key, required this.label, required this.onPressed, this.icon, this.expand = false, this.danger = false});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool expand;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? RB.error : RB.onSurface;
    final button = OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        side: BorderSide(color: color.withValues(alpha: 0.6)),
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        textStyle: RB.body(weight: FontWeight.w600),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
          Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}

class GlassCard extends StatelessWidget {
  const GlassCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap, this.radius = RB.radius, this.borderColor});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final double radius;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final content = Container(decoration: RB.glass(radius: radius, border: borderColor), padding: padding, child: child);
    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      child: InkWell(borderRadius: BorderRadius.circular(radius), onTap: onTap, child: content),
    );
  }
}

class SectionHead extends StatelessWidget {
  const SectionHead({super.key, required this.title, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(child: Text(title, style: RB.headline(size: 20))),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Text(action!, style: RB.body(size: 12, weight: FontWeight.w600, color: RB.neon)),
            ),
        ],
      ),
    );
  }
}

class PageTitle extends StatelessWidget {
  const PageTitle(this.title, {super.key, this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: RB.headline(size: 30)),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!, style: RB.body(color: RB.onSurfaceVariant)),
          ],
        ],
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.label, {super.key, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(label, style: RB.body(size: 11, weight: FontWeight.w700, color: color)),
    );
  }
}

class Loader extends StatelessWidget {
  const Loader({super.key, this.padding = const EdgeInsets.all(48)});
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => Padding(padding: padding, child: const Center(child: CircularProgressIndicator()));
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.text, this.action});
  final IconData icon;
  final String title;
  final String? text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
      child: Column(
        children: [
          Icon(icon, size: 48, color: RB.onSurfaceVariant.withValues(alpha: 0.6)),
          const SizedBox(height: 16),
          Text(title, style: RB.headline(size: 18), textAlign: TextAlign.center),
          if (text != null) ...[
            const SizedBox(height: 8),
            Text(text!, style: RB.body(color: RB.onSurfaceVariant), textAlign: TextAlign.center),
          ],
          if (action != null) ...[const SizedBox(height: 20), action!],
        ],
      ),
    );
  }
}

class ErrorBox extends StatelessWidget {
  const ErrorBox(this.message, {super.key, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: RB.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: RB.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: RB.error, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: RB.body(color: RB.error))),
          if (onRetry != null) TextButton(onPressed: onRetry, child: const Text('Повторить')),
        ],
      ),
    );
  }
}

/// Короткое уведомление сверху (ошибка формы, успех и т.д.).
void showToast(BuildContext context, String? message, {bool success = false}) {
  if (message == null || message.isEmpty) return;
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message, style: RB.body(size: 15, weight: FontWeight.w600, color: success ? RB.neon : RB.error)),
      duration: const Duration(milliseconds: 2800),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
}

class StatRow extends StatelessWidget {
  const StatRow({super.key, required this.label, required this.value, this.highlight = false});
  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(child: Text(label, style: RB.body(color: RB.onSurfaceVariant))),
          Text(value, style: RB.headline(size: 16, color: highlight ? RB.neon : RB.onSurface)),
        ],
      ),
    );
  }
}

/// Нижняя шторка с заголовком и кнопкой закрытия.
Future<T?> showDetailSheet<T>(BuildContext context, {required String title, required WidgetBuilder builder}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (ctx) => ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.88),
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 8, 8),
              child: Row(
                children: [
                  Expanded(child: Text(title, style: RB.headline(size: 20))),
                  IconButton(onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close), tooltip: 'Закрыть'),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                child: builder(ctx),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class Atmosphere extends StatelessWidget {
  const Atmosphere({super.key});

  @override
  Widget build(BuildContext context) {
    Widget blob(double size, double opacity) => Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(colors: [RB.neon.withValues(alpha: 0.08 * opacity), RB.neon.withValues(alpha: 0)]),
          ),
        );
    return IgnorePointer(
      child: LayoutBuilder(builder: (context, c) {
        return Stack(children: [
          Positioned(top: -c.maxHeight * 0.1, right: -c.maxWidth * 0.2, child: blob(c.maxWidth * 0.9, 1)),
          Positioned(bottom: c.maxHeight * 0.05, left: -c.maxWidth * 0.3, child: blob(c.maxWidth * 1.1, 0.5)),
        ]);
      }),
    );
  }
}

class SplashView extends StatelessWidget {
  const SplashView({super.key, this.offline = false});
  final bool offline;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: RB.bg,
      child: Stack(
        children: [
          const Positioned.fill(child: Atmosphere()),
          Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.03),
                      borderRadius: BorderRadius.circular(RB.radiusLg),
                      border: Border.all(color: RB.outline.withValues(alpha: 0.35)),
                      boxShadow: const [BoxShadow(color: Color(0x59000000), blurRadius: 32, offset: Offset(0, 8))],
                    ),
                    child: const BoltIcon(size: 80, glow: true),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'RUNBONUS',
                    style: RB.headline(size: 42, color: RB.neon).copyWith(
                      shadows: [Shadow(color: RB.neon.withValues(alpha: 0.4), blurRadius: 40)],
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (offline) ...[
                    Text('Нет интернета', style: RB.headline(size: 24), textAlign: TextAlign.center),
                    const SizedBox(height: 8),
                    Text('Проверьте Wi‑Fi или мобильные данные',
                        style: RB.body(color: RB.onSurfaceVariant), textAlign: TextAlign.center),
                    const SizedBox(height: 24),
                    const SizedBox.square(dimension: 56, child: CircularProgressIndicator(strokeWidth: 3)),
                    const SizedBox(height: 14),
                    Text('ЗАГРУЗКА…', style: RB.label(size: 12)),
                  ] else ...[
                    Text('Километры → награды', style: RB.body(color: RB.onSurfaceVariant)),
                    const SizedBox(height: 24),
                    const SizedBox.square(dimension: 80, child: CircularProgressIndicator(strokeWidth: 3)),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
