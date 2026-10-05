import 'dart:ui' as dart_ui;
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:coda/src/features/recommendation/application/audio_player_controller.dart';
import 'package:coda/src/core/utils/coda_youtube_player.dart';
import 'package:coda/src/core/utils/linked_scroll_controller.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class RecommendationCard extends ConsumerStatefulWidget {
  const RecommendationCard({required this.recommendation, super.key});

  final Recommendation recommendation;

  @override
  ConsumerState<RecommendationCard> createState() => _RecommendationCardState();
}

class _RecommendationCardState extends ConsumerState<RecommendationCard> {
  late final LinkedScrollController _horizontalScrollController;

  bool _isPlayingTrailer = false;

  @override
  void initState() {
    super.initState();
    _horizontalScrollController = LinkedScrollController();
  }

  @override
  void dispose() {
    _horizontalScrollController.dispose();
    super.dispose();
  }

  void _startTrailer() {
    final trailerId = widget.recommendation.trailerUrl;
    if (trailerId == null || trailerId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No trailer available for this pick'),
          duration: Duration(seconds: 1),
        ),
      );
      return;
    }

    ref.read(audioPlayerControllerProvider.notifier).pause();

    setState(() {
      _isPlayingTrailer = true;
    });
  }

  void _stopTrailer() {
    if (!_isPlayingTrailer) return;

    setState(() {
      _isPlayingTrailer = false;
    });

    ref.read(audioPlayerControllerProvider.notifier).resume();
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
                // ── Cutout Brightening Tint (matches Ask Coda) ──────────────
                Positioned.fill(
                  child: Container(color: Colors.white.withValues(alpha: 0.05)),
                ),

                // ── Layer 1: Knockout Mask (matches Ask Coda) ───────────────
                Positioned.fill(
                  child: RepaintBoundary(
                    child: ShaderMask(
                      shaderCallback: (Rect bounds) {
                        return LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.75),
                            Colors.black.withValues(alpha: 0.75),
                          ],
                        ).createShader(bounds);
                      },
                      blendMode: BlendMode.srcOut,
                      child: Container(
                        color: Colors.black.withValues(alpha: 0.01),
                        child: Stack(
                          children: [
                            Positioned.fill(
                              child: _CardLayout(
                                recommendation: widget.recommendation,
                                isKnockoutLayer: true,
                                scrollController: _horizontalScrollController,
                                isPlayingTrailer: false,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),

                // ── Layer 2: Normal Elements ────────────────────────────────
                _CardLayout(
                  recommendation: widget.recommendation,
                  isKnockoutLayer: false,
                  scrollController: _horizontalScrollController,
                  isPlayingTrailer: _isPlayingTrailer,
                  onLongPressStart: _startTrailer,
                  onLongPressEnd: _stopTrailer,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CardLayout extends ConsumerWidget {
  const _CardLayout({
    required this.recommendation,
    required this.isKnockoutLayer,
    required this.scrollController,
    required this.isPlayingTrailer,
    this.onLongPressStart,
    this.onLongPressEnd,
  });

  final Recommendation recommendation;
  final bool isKnockoutLayer;
  final ScrollController scrollController;
  final bool isPlayingTrailer;
  final VoidCallback? onLongPressStart;
  final VoidCallback? onLongPressEnd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final memory = ref.watch(livingMemoryProvider);
    final onWatchlist = memory.watchlist.any(
      (item) => item.title.toLowerCase() == recommendation.title.toLowerCase(),
    );

    final List<String> gatheredTags = [];
    if (onWatchlist) {
      gatheredTags.add('From Watchlist');
    }
    if (recommendation.releaseYear.isNotEmpty) {
      gatheredTags.add(recommendation.releaseYear);
    }
    if (recommendation.studio.isNotEmpty) {
      gatheredTags.add(recommendation.studio);
    }

    final Set<String> lowercaseAdded = gatheredTags.map((t) => t.toLowerCase()).toSet();

    // Runtime / episode count pills come first (recommendation.tags, e.g. '13 eps', '2h 49m')
    for (final tag in recommendation.tags) {
      if (tag.isNotEmpty && !lowercaseAdded.contains(tag.toLowerCase())) {
        gatheredTags.add(tag);
        lowercaseAdded.add(tag.toLowerCase());
      }
    }

    // Then genres and fit signals
    final List<String> extraPills = [
      ...recommendation.genres,
      ...recommendation.fitSignals,
    ];

    for (final pill in extraPills) {
      if (pill.isNotEmpty && !lowercaseAdded.contains(pill.toLowerCase())) {
        gatheredTags.add(pill);
        lowercaseAdded.add(pill.toLowerCase());
      }
    }

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
                : Image.asset(
                    'assets/images/coda_logo.png',
                    width: 45,
                    height: 45,
                    fit: BoxFit.contain,
                  ),
          ),

          const SizedBox(height: 16), // Reduced top gap to 16px

          // ── Hero Text / Blurb ────────────────────────────────────
          Padding(
            padding: const EdgeInsets.only(
              left: 24,
              right: 55,
            ),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: SizedBox(
                width: 330, // Force wrap at a standard readable width
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
            ),
          ),

          const SizedBox(height: 18), // Reduced bottom gap
          // ── Poster Image ─────────────────────────────────────────
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 24,
              ), // 24px margin on both sides
              child: _PosterWithTrailer(
                recommendation: recommendation,
                isPlayingTrailer: isPlayingTrailer,
                isKnockoutLayer: isKnockoutLayer,
                onLongPressStart: onLongPressStart,
                onLongPressEnd: onLongPressEnd,
              ),
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
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final tag in gatheredTags) ...[
                    _TagPill(label: tag, isKnockoutLayer: isKnockoutLayer),
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
    final cleanBlurb = recommendation.codaBlurb.replaceAll('**', '').replaceAll('*', '').trim();
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: cleanBlurb),
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

  // Removed _buildPoster, logic encapsulated inside _PosterWithTrailer

  Widget _buildTitle(bool isKnockoutLayer) {
    final titleStyle = GoogleFonts.inter(
      fontSize: 18,
      fontWeight: FontWeight.w700,
      height: 1.2,
    );
    final yearStyle = GoogleFonts.inter(
      fontSize: 16,
      fontWeight: FontWeight.w500,
      height: 1.2,
    );

    return Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: recommendation.title,
            style: titleStyle.copyWith(
              color: isKnockoutLayer ? Colors.transparent : Colors.white,
            ),
          ),
          if (recommendation.releaseYear.isNotEmpty) ...[
            TextSpan(
              text: '  ',
              style: yearStyle.copyWith(color: Colors.transparent),
            ),
            TextSpan(
              text: recommendation.releaseYear,
              style: yearStyle.copyWith(
                color: isKnockoutLayer ? Colors.black : Colors.transparent,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _TagPill extends StatelessWidget {
  const _TagPill({required this.label, required this.isKnockoutLayer});

  final String label;
  final bool isKnockoutLayer;

  @override
  Widget build(BuildContext context) {
    final textStyle = GoogleFonts.inter(
      fontSize: 15,
      fontWeight: FontWeight.w900,
      height: 1.3,
    );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: isKnockoutLayer ? Colors.black : Colors.transparent,
        borderRadius: BorderRadius.circular(50),
      ),
      child: Text(
        label,
        style: textStyle.copyWith(
          color: isKnockoutLayer
              ? Colors.transparent
              : Colors.black.withValues(
                  alpha: 0.7,
                ), // Increased opacity to 70%
        ),
      ),
    );
  }
}

class _PosterWithTrailer extends StatefulWidget {
  const _PosterWithTrailer({
    required this.recommendation,
    required this.isPlayingTrailer,
    required this.isKnockoutLayer,
    required this.onLongPressStart,
    required this.onLongPressEnd,
  });

  final Recommendation recommendation;
  final bool isPlayingTrailer;
  final bool isKnockoutLayer;
  final VoidCallback? onLongPressStart;
  final VoidCallback? onLongPressEnd;

  @override
  State<_PosterWithTrailer> createState() => _PosterWithTrailerState();
}

class _PosterWithTrailerState extends State<_PosterWithTrailer> with SingleTickerProviderStateMixin {
  bool _isPlayerReady = false;
  late final AnimationController _scaleController;

  @override
  void initState() {
    super.initState();
    _scaleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 150),
      lowerBound: 0.95,
      upperBound: 1.0,
      value: 1.0,
    );
  }

  @override
  void dispose() {
    _scaleController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant _PosterWithTrailer oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Reset the ready state when trailer starts or stops
    if (widget.isPlayingTrailer != oldWidget.isPlayingTrailer) {
      if (!widget.isPlayingTrailer) {
        setState(() {
          _isPlayerReady = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isKnockoutLayer) {
      return const SizedBox.expand();
    }

    final hasTrailer = widget.recommendation.trailerUrl != null &&
        widget.recommendation.trailerUrl!.isNotEmpty;

    return ScaleTransition(
      scale: _scaleController,
      child: GestureDetector(
        onTap: () async {
          // 1. Depress
          await _scaleController.animateTo(0.95, curve: Curves.easeOut);
          // 2. Spring up Snappy
          _scaleController.animateTo(1.0, curve: Curves.elasticOut);
          // 3. Small visual delay so the user experiences the spring
          await Future.delayed(const Duration(milliseconds: 120));
          if (mounted) {
            context.push('/detail/${widget.recommendation.id}', extra: widget.recommendation);
          }
        },
        onLongPress: hasTrailer ? widget.onLongPressStart : null,
        onLongPressEnd: hasTrailer ? (_) => widget.onLongPressEnd?.call() : null,
        onLongPressCancel: hasTrailer ? widget.onLongPressEnd : null,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // 1. Base Poster (underneath)
              _buildBasePoster(isHero: true),

              // 2. YouTube Trailer (rendered if playing)
              if (widget.isPlayingTrailer && hasTrailer)
                Positioned.fill(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: FittedBox(
                      fit: BoxFit.cover,
                      child: SizedBox(
                        width: 320,
                        height: 180,
                        child: CodaYoutubePlayer(
                          videoId: widget.recommendation.trailerUrl!,
                          autoPlay: true,
                          showControls: false,
                          mute: false,
                          loop: true,
                          onReady: () {
                            if (mounted) {
                              setState(() {
                                _isPlayerReady = true;
                              });
                            }
                          },
                        ),
                      ),
                    ),
                  ),
                ),
              // Inner border overlay to hide YouTube player square corners bleeding on Android
              if (widget.isPlayingTrailer && hasTrailer)
                Positioned.fill(
                  child: IgnorePointer(
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: const Color(0xFF1C1C1E), // Match dark card background
                          width: 2.0,
                        ),
                      ),
                    ),
                  ),
                ),

              // 3. Glowing Loading Spinner overlay (rendered when player is loading)
              if (widget.isPlayingTrailer && hasTrailer && !_isPlayerReady)
                Positioned.fill(
                  child: Container(
                    color: Colors.black.withValues(alpha: 0.55),
                    child: BackdropFilter(
                      filter: dart_ui.ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const SizedBox(
                              width: 36,
                              height: 36,
                              child: CircularProgressIndicator(
                                color: Colors.white70,
                                strokeWidth: 3,
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'Tuning in...',
                              style: GoogleFonts.inter(
                                color: Colors.white70,
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.5,
                              ),
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
      ),
    );
  }

  Widget _buildBasePoster({bool isHero = false}) {
    final hasHolder = widget.recommendation.posterUrl != null &&
        widget.recommendation.posterUrl!.startsWith('holder:');
    Widget poster;
    if (hasHolder) {
      final title = widget.recommendation.posterUrl!.substring(7);
      poster = Container(
        width: double.infinity,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            colors: widget.recommendation.posterGradient,
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
    } else {
      poster = Container(
        width: double.infinity,
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20)),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: FallbackImage(
            url: widget.recommendation.posterUrl,
            fit: BoxFit.cover,
            errorWidget: Container(color: Colors.grey.shade900),
          ),
        ),
      );
    }

    if (isHero) {
      return Hero(
        tag: 'poster_${widget.recommendation.id}',
        child: poster,
      );
    }
    return poster;
  }
}
