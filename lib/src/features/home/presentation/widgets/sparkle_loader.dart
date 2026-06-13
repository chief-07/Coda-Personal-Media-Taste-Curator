import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class SparkleLoader extends StatefulWidget {
  const SparkleLoader({
    super.key,
    this.color = Colors.white,
    this.size = 28,
  });

  final Color color;
  final double size;

  @override
  State<SparkleLoader> createState() => _SparkleLoaderState();
}

class _SparkleLoaderState extends State<SparkleLoader> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final double opacity = 0.35 + (_controller.value * 0.65); // Pulse between 0.35 and 1.0
        final double glowRadius = 4.0 + (_controller.value * 12.0); // Pulsing glow blur radius

        return Opacity(
          opacity: opacity,
          child: Icon(
            PhosphorIcons.sparkle(PhosphorIconsStyle.fill),
            color: widget.color,
            size: widget.size,
            shadows: [
              Shadow(
                color: widget.color.withValues(alpha: 0.6),
                blurRadius: glowRadius,
              ),
            ],
          ),
        );
      },
    );
  }
}
