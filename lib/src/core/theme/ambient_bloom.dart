import 'package:flutter/material.dart';

/// Screen-wide breathing ambient bloom layer.
/// Placed behind knockout masks and content to provide Coda's signature luminous atmosphere.
class AmbientBloomLayer extends StatefulWidget {
  final Alignment center;
  final double radius;
  final double baseCoreOpacity;
  final double pulseCoreOpacity;
  final double baseWashOpacity;
  final double pulseWashOpacity;

  const AmbientBloomLayer({
    super.key,
    this.center = const Alignment(0, -0.05),
    this.radius = 1.35,
    this.baseCoreOpacity = 0.12,
    this.pulseCoreOpacity = 0.48,
    this.baseWashOpacity = 0.04,
    this.pulseWashOpacity = 0.14,
  });

  @override
  State<AmbientBloomLayer> createState() => _AmbientBloomLayerState();
}

class _AmbientBloomLayerState extends State<AmbientBloomLayer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3800),
    )..repeat(reverse: true);

    _pulseAnimation = CurvedAnimation(
      parent: _pulseController,
      curve: Curves.easeInOut,
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: IgnorePointer(
        child: AnimatedBuilder(
          animation: _pulseAnimation,
          builder: (context, _) {
            final double progress = _pulseAnimation.value;
            // Bloom scale: gently expands across the whole canvas
            final double scale = 1.0 + (progress * 0.22);
            // Luminous opacities designed to shine through the dark card's 75% mask
            final double bloomCoreOpacity =
                widget.baseCoreOpacity + (progress * widget.pulseCoreOpacity);
            final double bloomMidOpacity =
                (widget.baseCoreOpacity * 0.5) + (progress * (widget.pulseCoreOpacity * 0.58));
            final double bloomEdgeOpacity =
                (widget.baseCoreOpacity * 0.16) + (progress * (widget.pulseCoreOpacity * 0.29));
            final double washOpacity =
                widget.baseWashOpacity + (progress * widget.pulseWashOpacity);

            return Stack(
              fit: StackFit.expand,
              children: [
                // Full-screen ambient wash
                Container(
                  color: Colors.white.withValues(alpha: washOpacity),
                ),
                // Screen-spanning radial bloom
                Transform.scale(
                  scale: scale,
                  alignment: widget.center,
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        center: widget.center,
                        radius: widget.radius,
                        colors: [
                          Colors.white.withValues(alpha: bloomCoreOpacity),
                          Colors.white.withValues(alpha: bloomMidOpacity),
                          Colors.white.withValues(alpha: bloomEdgeOpacity),
                          Colors.transparent,
                        ],
                        stops: const [0.0, 0.40, 0.85, 1.0],
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
