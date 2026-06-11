import 'dart:ui' as dart_ui;
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/core/providers/api_config.dart';

class MediaDetailScreen extends ConsumerWidget {
  const MediaDetailScreen({required this.recommendation, super.key});

  final Recommendation recommendation;

  List<Widget> _buildStreamingButtons(BuildContext context) {
    final type = recommendation.mediaType.name.toLowerCase();
    
    // Quick links based on media type
    if (type == 'anime' || type == 'manga') {
      return [
        _buildLinkButton(context, 'Crunchyroll', PhosphorIconsBold.playCircle, 'https://www.crunchyroll.com'),
        _buildLinkButton(context, 'Netflix', PhosphorIconsBold.filmStrip, 'https://www.netflix.com'),
      ];
    } else if (type == 'movie' || type == 'tv' || type == 'show') {
      return [
        _buildLinkButton(context, 'Netflix', PhosphorIconsBold.filmStrip, 'https://www.netflix.com'),
        _buildLinkButton(context, 'Prime Video', PhosphorIconsBold.television, 'https://www.amazon.com/Prime-Video'),
      ];
    } else if (type == 'game' || type == 'visual novel' || type == 'visualnovel') {
      return [
        _buildLinkButton(context, 'Steam', PhosphorIconsBold.gameController, 'https://store.steampowered.com'),
      ];
    } else if (type == 'book') {
      return [
        _buildLinkButton(context, 'Google Books', PhosphorIconsBold.bookOpen, 'https://books.google.com'),
        _buildLinkButton(context, 'Open Library', PhosphorIconsBold.bookmarks, 'https://openlibrary.org'),
      ];
    }
    
    // Default fallback
    return [
      _buildLinkButton(context, 'Google Search', PhosphorIconsBold.magnifyingGlass, 'https://www.google.com'),
    ];
  }

  Widget _buildLinkButton(BuildContext context, String label, IconData icon, String url) {
    return Expanded(
      child: GestureDetector(
        onTap: () {
          // Placeholder action
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Opening $label...'),
              backgroundColor: const Color(0xFF16181C),
            ),
          );
        },
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.08),
              width: 1,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: Colors.white70, size: 18),
              const SizedBox(width: 8),
              Text(
                label,
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;

    return Scaffold(
      backgroundColor: const Color(0xFF101114),
      body: Stack(
        children: [
          // ── Blurred background image ────────────────────────
          Positioned.fill(
            child: recommendation.posterUrl != null &&
                    recommendation.posterUrl!.isNotEmpty &&
                    !recommendation.posterUrl!.startsWith('holder:')
                ? Transform.scale(
                    scale: 1.2,
                    child: ImageFiltered(
                      imageFilter: dart_ui.ImageFilter.blur(
                        sigmaX: 80,
                        sigmaY: 80,
                        tileMode: TileMode.mirror,
                      ),
                      child: FallbackImage(
                        url: recommendation.posterUrl,
                        fit: BoxFit.cover,
                      ),
                    ),
                  )
                : Container(color: const Color(0xFF101114)),
          ),
          Positioned.fill(
            child: Container(color: Colors.black.withValues(alpha: 0.35)),
          ),

          // ── Scrollable Details ──────────────────────────────
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Custom App Bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      GestureDetector(
                        onTap: () => context.pop(),
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.white.withValues(alpha: 0.07),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.12),
                            ),
                          ),
                          child: const Icon(
                            PhosphorIconsBold.caretLeft,
                            color: Colors.white,
                            size: 20,
                          ),
                        ),
                      ),
                      Text(
                        recommendation.mediaType.name.toUpperCase(),
                        style: GoogleFonts.inter(
                          color: Colors.white60,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.5,
                        ),
                      ),
                      const SizedBox(width: 40), // spacer for symmetry
                    ],
                  ),
                ),
                
                Expanded(
                  child: SingleChildScrollView(
                    physics: const BouncingScrollPhysics(),
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 16),
                        
                        // Centered Poster Layout
                        Center(
                          child: Container(
                            width: screenWidth * 0.58,
                            height: (screenWidth * 0.58) * 1.5,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(24),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.4),
                                  blurRadius: 30,
                                  offset: const Offset(0, 15),
                                ),
                              ],
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(24),
                              child: FallbackImage(
                                url: recommendation.posterUrl,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                        
                        const SizedBox(height: 28),
                        
                        // Title
                        Text(
                          recommendation.title,
                          style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                            height: 1.1,
                          ),
                        ),
                        
                        const SizedBox(height: 8),
                        
                        // Year & Tags
                        Row(
                          children: [
                            if (recommendation.releaseYear != null) ...[
                              Text(
                                recommendation.releaseYear!,
                                style: GoogleFonts.inter(
                                  color: Colors.white38,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Container(
                                width: 4,
                                height: 4,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Colors.white24,
                                ),
                              ),
                              const SizedBox(width: 12),
                            ],
                            Expanded(
                              child: SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                physics: const BouncingScrollPhysics(),
                                child: Row(
                                  children: recommendation.tags.map((tag) {
                                    return Container(
                                      margin: const EdgeInsets.only(right: 8),
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withValues(alpha: 0.06),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: Text(
                                        tag,
                                        style: GoogleFonts.inter(
                                          color: Colors.white60,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ),
                            ),
                          ],
                        ),
                        
                        const SizedBox(height: 24),
                        
                        // Coda's Blurb
                        Text(
                          recommendation.codaBlurb,
                          style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            height: 1.4,
                          ),
                        ),
                        
                        const SizedBox(height: 16),
                        
                        // Description
                        if (recommendation.description.isNotEmpty)
                          Text(
                            recommendation.description,
                            style: GoogleFonts.inter(
                              color: Colors.white70,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              height: 1.6,
                            ),
                          ),
                          
                        const SizedBox(height: 32),
                        
                        // Direct Links Heading
                        Text(
                          'DIRECT STREAMING & LINKS',
                          style: GoogleFonts.inter(
                            color: Colors.white38,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.2,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            ..._buildStreamingButtons(context),
                          ],
                        ),
                        
                        const SizedBox(height: 120), // bottom spacing for Watch button
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          
          // ── Fixed Watch Button at bottom ────────────────────
          Positioned(
            left: 24,
            right: 24,
            bottom: MediaQuery.of(context).padding.bottom + 16,
            child: GestureDetector(
              onTap: () {
                // Set as active session
                ref.read(activeSessionProvider.notifier).start(recommendation);
                // Navigate to session screen
                context.go('/session');
              },
              child: Container(
                height: 54,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(27),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.3),
                      blurRadius: 15,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(PhosphorIconsBold.play, color: Colors.black, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'Start Session',
                      style: GoogleFonts.inter(
                        color: Colors.black,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
