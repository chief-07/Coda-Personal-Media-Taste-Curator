import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class RecommendationCard extends StatefulWidget {
  const RecommendationCard({required this.recommendation, super.key});

  final Recommendation recommendation;

  @override
  State<RecommendationCard> createState() => _RecommendationCardState();
}

class _RecommendationCardState extends State<RecommendationCard> {
  final _maskScrollController = ScrollController();
  final _topScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    // Sync the knockout mask scroll to exactly match the top layer scroll
    _topScrollController.addListener(() {
      if (_maskScrollController.hasClients &&
          _topScrollController.offset != _maskScrollController.offset) {
        _maskScrollController.jumpTo(_topScrollController.offset);
      }
    });
  }

  @override
  void dispose() {
    _maskScrollController.dispose();
    _topScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(64),
      ), // Increased radius
      child: LayoutBuilder(
        builder: (context, constraints) {
          return ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Stack(
              children: [
                // ── Layer 1: Knockout Mask ──────────────────────────────────
                Positioned.fill(
                  child: ShaderMask(
                    shaderCallback: (Rect bounds) {
                      return LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(
                            alpha: 0.75,
                          ), // Solid black at top
                          Colors.black.withValues(
                            alpha: 0.75,
                          ), // Stays solid for text
                          Colors.black.withValues(
                            alpha: 0.50,
                          ), // Fades to 50% transparent at bottom
                        ],
                        stops: const [0.0, 0.65, 1.0],
                      ).createShader(bounds);
                    },
                    blendMode: BlendMode.srcOut,
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: Container(color: Colors.black.withValues(alpha: 0.01)),
                        ),
                        _CardLayout(
                          recommendation: widget.recommendation,
                          isKnockoutLayer: true,
                          scrollController: _maskScrollController,
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Layer 2: Normal Elements ────────────────────────────────
                _CardLayout(
                  recommendation: widget.recommendation,
                  isKnockoutLayer: false,
                  scrollController: _topScrollController,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CardLayout extends StatelessWidget {
  const _CardLayout({
    required this.recommendation,
    required this.isKnockoutLayer,
    required this.scrollController,
  });

  final Recommendation recommendation;
  final bool isKnockoutLayer;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 110), // Decreased from 120
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(
            height: 24,
          ), // Increased from 16 to move circle down slightly
          // ── Coda Avatar ──────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: isKnockoutLayer
                ? Container(
                    width: 45, // Scaled down circle
                    height: 45,
                    decoration: const BoxDecoration(
                      color: Colors.black,
                      shape: BoxShape.circle,
                    ),
                  )
                : Opacity(
                    opacity: 0,
                    child: const SizedBox(width: 45, height: 45),
                  ),
          ),

          const SizedBox(height: 16), // Reduced top gap to 16px
          // ── Hero Text ────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.only(
              left: 24,
              right: 55,
            ), // Adjusted right pad for wider letters
            child: isKnockoutLayer
                ? _buildHeroText(Colors.black)
                : GestureDetector(
                    onTap: () {
                      context.push('/pitch/${recommendation.id}', extra: recommendation);
                    },
                    child: Opacity(
                      opacity: 0,
                      child: _buildHeroText(Colors.white),
                    ),
                  ),
          ),

          const SizedBox(height: 18), // Reduced bottom gap
          // ── Poster Image ─────────────────────────────────────────
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 24,
              ), // 24px margin on both sides
              child: isKnockoutLayer
                  ? Opacity(
                      opacity: 0, // Hidden in knockout layer
                      child: _buildPoster(),
                    )
                  : _buildPoster(),
            ),
          ),

          const SizedBox(height: 20),

          // ── Title ────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: _buildTitle(isKnockoutLayer),
          ),

          const SizedBox(height: 16),

          // ── Tag Pills ────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: SingleChildScrollView(
              controller: scrollController,
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              clipBehavior: Clip.hardEdge,
              child: Row(
                children: [
                  for (final tag in recommendation.tags) ...[
                    _TagPill(label: tag, isKnockoutLayer: isKnockoutLayer),
                    const SizedBox(width: 8),
                  ],
                  for (final signal in recommendation.fitSignals) ...[
                    _TagPill(label: signal, isKnockoutLayer: isKnockoutLayer),
                    const SizedBox(width: 8),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeroText(Color color) {
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: recommendation.codaBlurb),
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: Padding(
              padding: const EdgeInsets.only(left: 4.0),
              child: Icon(
                Icons.arrow_forward_ios_rounded,
                size: 30, // Reduced caret size
                weight: 900, // Increase caret weight
                color: color,
                shadows: [
                  Shadow(
                    offset: const Offset(0.5, 0),
                    blurRadius: 0.5,
                    color: color,
                  ),
                  Shadow(
                    offset: const Offset(-0.5, 0),
                    blurRadius: 0.5,
                    color: color,
                  ),
                  Shadow(
                    offset: const Offset(0, 0.5),
                    blurRadius: 0.5,
                    color: color,
                  ),
                  Shadow(
                    offset: const Offset(0, -0.5),
                    blurRadius: 0.5,
                    color: color,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      style: GoogleFonts.inter(
        color: color,
        fontSize: 30, // Reduced text size
        fontWeight: FontWeight.w900, // Maximum standard weight
        height: 1.2, // Tweaked line spacing to 1.2
        letterSpacing: 1.5, // Increased letter spacing
      ),
    );
  }

  Widget _buildPoster() {
    final hasHolder = recommendation.posterUrl != null && recommendation.posterUrl!.startsWith('holder:');
    if (hasHolder) {
      final title = recommendation.posterUrl!.substring(7);
      return Container(
        width: double.infinity,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            colors: recommendation.posterGradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Text(
              title,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                color: Colors.white.withValues(alpha: 0.9),
                fontSize: 28,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.0,
                shadows: [
                  Shadow(
                    offset: const Offset(2.0, 2.0),
                    blurRadius: 10.0,
                    color: Colors.black.withValues(alpha: 0.5),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      width: double
          .infinity, // Forces poster to span all available horizontal space up to margins
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(20)),
      child: recommendation.posterUrl != null
          ? ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: Image(
                image: recommendation.posterUrl!.startsWith('assets/')
                    ? AssetImage(recommendation.posterUrl!) as ImageProvider
                    : NetworkImage(recommendation.posterUrl!),
                fit: BoxFit.cover,
              ),
            )
          : Container(color: Colors.grey.shade900),
    );
  }

  Widget _buildTitle(bool isKnockoutLayer) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        // Title (Normal Layer only)
        isKnockoutLayer
            ? Opacity(
                opacity: 0,
                child: Text(
                  recommendation.title,
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    height: 1.2,
                  ),
                ),
              )
            : Flexible(
                child: Text(
                  recommendation.title,
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    height: 1.2,
                  ),
                ),
              ),
        const SizedBox(width: 8),
        // Year (Knockout Layer only, so it punches a hole)
        isKnockoutLayer
            ? Text(
                recommendation.releaseYear,
                style: GoogleFonts.inter(
                  color: Colors.black,
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  height: 1.2,
                ),
              )
            : Opacity(
                opacity: 0,
                child: Text(
                  recommendation.releaseYear,
                  style: GoogleFonts.inter(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    height: 1.2,
                  ),
                ),
              ),
      ],
    );
  }
}

class _TagPill extends StatelessWidget {
  const _TagPill({required this.label, required this.isKnockoutLayer});

  final String label;
  final bool isKnockoutLayer;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: isKnockoutLayer ? Colors.black : Colors.transparent,
        borderRadius: BorderRadius.circular(50),
      ),
      child: isKnockoutLayer
          ? Opacity(
              opacity: 0,
              child: Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  height: 1.3,
                ),
              ),
            )
          : Text(
              label,
              style: GoogleFonts.inter(
                color: Colors.black.withValues(
                  alpha: 0.7,
                ), // Increased opacity to 70%
                fontSize: 15,
                fontWeight: FontWeight.w900, // Increased weight
                height: 1.3,
              ),
            ),
    );
  }
}
