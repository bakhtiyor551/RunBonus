import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Круглая кнопка: удерживать 2 с, чтобы завершить (кольцо прогресса).
class HoldToStopButton extends StatefulWidget {
  const HoldToStopButton({super.key, required this.onStop, this.enabled = true, this.label = 'Удерживайте для завершения'});
  final VoidCallback onStop;
  final bool enabled;
  final String label;

  @override
  State<HoldToStopButton> createState() => _HoldToStopButtonState();
}

class _HoldToStopButtonState extends State<HoldToStopButton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 2))
    ..addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        HapticFeedback.mediumImpact();
        widget.onStop();
        Future.delayed(const Duration(milliseconds: 200), () {
          if (mounted) _c.value = 0;
        });
      }
    });

  bool get _holding => _c.isAnimating;

  void _start() {
    if (!widget.enabled) return;
    HapticFeedback.selectionClick();
    _c.forward(from: 0);
  }

  void _cancel() {
    if (_c.status != AnimationStatus.completed) _c.value = 0;
  }

  @override
  void didUpdateWidget(HoldToStopButton old) {
    super.didUpdateWidget(old);
    if (!widget.enabled) _cancel();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: widget.label,
      enabled: widget.enabled,
      child: Opacity(
        opacity: widget.enabled ? 1 : 0.45,
        child: Listener(
          onPointerDown: (_) => _start(),
          onPointerUp: (_) => _cancel(),
          onPointerCancel: (_) => _cancel(),
          child: AnimatedBuilder(
            animation: _c,
            builder: (context, _) => SizedBox.square(
              dimension: 72,
              child: CustomPaint(
                painter: _RingPainter(_c.value),
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: AnimatedScale(
                    scale: _holding ? 0.96 : 1,
                    duration: const Duration(milliseconds: 120),
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Color.fromRGBO(44, 44, 46, _holding ? 0.45 : 0.28),
                        border: Border.all(
                          width: 1.5,
                          color: _holding ? Colors.white.withValues(alpha: 0.4) : Colors.black.withValues(alpha: 0.22),
                        ),
                        boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 14, offset: Offset(0, 4))],
                      ),
                      child: Icon(Icons.close, size: 28, color: _holding ? Colors.white : const Color(0xFF111111)),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.progress);
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0) return;
    final rect = Offset.zero & size;
    canvas.drawArc(
      rect.deflate(1.5),
      -math.pi / 2,
      2 * math.pi * progress,
      false,
      Paint()
        ..color = const Color(0xFF111111)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.progress != progress;
}
