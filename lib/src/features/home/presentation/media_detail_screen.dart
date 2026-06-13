import 'dart:ui' as dart_ui;
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:coda/src/features/recommendation/application/audio_player_controller.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/core/providers/api_config.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/core/utils/url_helper.dart';
import 'package:coda/src/core/utils/coda_youtube_player.dart';

class MediaDetailScreen extends ConsumerWidget {
  const MediaDetailScreen({required this.recommendation, super.key});

  final Recommendation recommendation;

  Future<void> _launchUrl(BuildContext context, String urlString) async {
    try {
      await openUrl(urlString);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error launching link: $e'),
            backgroundColor: const Color(0xFFE03E3E),
          ),
        );
      }
    }
  }

  Widget _buildLinkButton(BuildContext context, WidgetRef ref, String label, IconData icon, String url) {
    return GestureDetector(
      onTap: () {
        ref.read(activeSessionProvider.notifier).start(recommendation);
        context.go('/session');
        _launchUrl(context, url);
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
    );
  }

  List<Widget> _buildLinkButtons(BuildContext context, WidgetRef ref) {
    final List<Widget> buttons = [];
    final type = recommendation.mediaType;
    final query = recommendation.title;
    
    void addButton(String label, IconData icon, String url) {
      buttons.add(_buildLinkButton(context, ref, label, icon, url));
    }

    switch (type) {
      case MediaType.anime:
        addButton('Crunchyroll', PhosphorIconsBold.playCircle, 'https://www.crunchyroll.com/search?q=${Uri.encodeComponent(query)}');
        addButton('Netflix', PhosphorIconsBold.filmStrip, 'https://www.netflix.com/search?q=${Uri.encodeComponent(query)}');
        break;
      case MediaType.manga:
        addButton('MangaDex', PhosphorIconsBold.bookOpen, 'https://mangadex.org/search?q=${Uri.encodeComponent(query)}');
        addButton('Netflix', PhosphorIconsBold.filmStrip, 'https://www.netflix.com/search?q=${Uri.encodeComponent(query)}');
        break;
      case MediaType.movie:
      case MediaType.tv:
        addButton('Netflix', PhosphorIconsBold.filmStrip, 'https://www.netflix.com/search?q=${Uri.encodeComponent(query)}');
        addButton('Prime Video', PhosphorIconsBold.television, 'https://www.amazon.com/s?k=${Uri.encodeComponent(query)}');
        break;
      case MediaType.visualNovel:
        addButton('VNDB', PhosphorIconsBold.bookBookmark, 'https://vndb.org/v?sq=${Uri.encodeComponent(query)}');
        addButton('Steam', PhosphorIconsBold.gameController, 'https://store.steampowered.com/search/?term=${Uri.encodeComponent(query)}');
        break;
      case MediaType.game:
        addButton('Steam', PhosphorIconsBold.gameController, 'https://store.steampowered.com/search/?term=${Uri.encodeComponent(query)}');
        addButton('Epic Games', PhosphorIconsBold.gameController, 'https://store.epicgames.com/en-US/browse?q=${Uri.encodeComponent(query)}');
        break;
      case MediaType.book:
        addButton('Google Books', PhosphorIconsBold.bookOpen, 'https://books.google.com/books?q=${Uri.encodeComponent(query)}');
        addButton('Open Library', PhosphorIconsBold.bookmarks, 'https://openlibrary.org/search?q=${Uri.encodeComponent(query)}');
        break;
      case MediaType.youtube:
        addButton('YouTube', PhosphorIconsBold.youtubeLogo, 'https://www.youtube.com/results?search_query=${Uri.encodeComponent(query)}');
        break;
      case MediaType.music:
        addButton('Spotify', PhosphorIconsBold.musicNotes, 'https://open.spotify.com/search/${Uri.encodeComponent(query)}');
        addButton('YouTube Music', PhosphorIconsBold.youtubeLogo, 'https://music.youtube.com/search?q=${Uri.encodeComponent(query)}');
        break;
      default:
        break;
    }

    // Always add Google Search at the end
    addButton(
      'Google Search',
      PhosphorIconsBold.magnifyingGlass,
      'https://www.google.com/search?q=${Uri.encodeComponent('$query ${type.label}')}',
    );

    return buttons;
  }

  List<Widget> _buildLinkGrid(BuildContext context, WidgetRef ref) {
    final buttons = _buildLinkButtons(context, ref);
    final List<Widget> rows = [];
    
    for (int i = 0; i < buttons.length; i += 2) {
      if (i + 1 < buttons.length) {
        rows.add(
          Row(
            children: [
              Expanded(child: buttons[i]),
              const SizedBox(width: 12),
              Expanded(child: buttons[i + 1]),
            ],
          ),
        );
      } else {
        rows.add(buttons[i]);
      }
      if (i + 2 < buttons.length) {
        rows.add(const SizedBox(height: 12));
      }
    }
    
    return rows;
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
                          child: GestureDetector(
                            onTap: () {
                              if (recommendation.trailerUrl != null && recommendation.trailerUrl!.isNotEmpty) {
                                _showTrailerDialog(context, ref, recommendation.trailerUrl!, recommendation.title);
                              } else {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('No trailer available for this pick'),
                                    duration: Duration(seconds: 2),
                                  ),
                                );
                              }
                            },
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
                              child: Hero(
                                tag: 'poster_${recommendation.id}',
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(24),
                                  child: FallbackImage(
                                    url: recommendation.posterUrl,
                                    fit: BoxFit.cover,
                                  ),
                                ),
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
                        
                        // Year, Studio, Genre, Themes Detail Items
                        Builder(
                          builder: (context) {
                            final List<String> detailItems = [];
                            if (recommendation.releaseYear.isNotEmpty) {
                              detailItems.add(recommendation.releaseYear);
                            }
                            if (recommendation.studio.isNotEmpty) {
                              detailItems.add(recommendation.studio);
                            }
                            if (recommendation.genres.isNotEmpty) {
                              detailItems.addAll(recommendation.genres.take(2));
                            }
                            if (recommendation.tags.isNotEmpty) {
                              final uniqueTags = recommendation.tags
                                  .where((t) => !detailItems.contains(t))
                                  .take(2);
                              detailItems.addAll(uniqueTags);
                            }
                            if (recommendation.fitSignals.isNotEmpty) {
                              final uniqueThemes = recommendation.fitSignals
                                  .where((t) => !detailItems.contains(t))
                                  .take(2);
                              detailItems.addAll(uniqueThemes);
                            }

                            if (detailItems.isEmpty) return const SizedBox.shrink();

                            return Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              spacing: 8,
                              runSpacing: 6,
                              children: [
                                for (int i = 0; i < detailItems.length; i++) ...[
                                  Text(
                                    detailItems[i],
                                    style: GoogleFonts.inter(
                                      color: Colors.white60,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  if (i < detailItems.length - 1)
                                    Container(
                                      width: 4,
                                      height: 4,
                                      decoration: const BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: Colors.white24,
                                      ),
                                    ),
                                ],
                              ],
                            );
                          },
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
                        if (recommendation.description.isNotEmpty &&
                            recommendation.description.toLowerCase() != recommendation.title.toLowerCase())
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
                        ..._buildLinkGrid(context, ref),
                        
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

  void _showTrailerDialog(BuildContext context, WidgetRef ref, String videoId, String title) {
    ref.read(audioPlayerControllerProvider.notifier).pause();

    showDialog(
      context: context,
      barrierDismissible: true,
      barrierColor: Colors.black.withValues(alpha: 0.85),
      builder: (context) {
        return _TrailerDialog(videoId: videoId, title: title);
      },
    ).then((_) {
      ref.read(audioPlayerControllerProvider.notifier).resume();
    });
  }
}

class _TrailerDialog extends StatelessWidget {
  const _TrailerDialog({required this.videoId, required this.title});

  final String videoId;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: Container(
              margin: const EdgeInsets.only(bottom: 12),
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.15),
              ),
              child: const Icon(Icons.close, color: Colors.white, size: 20),
            ),
          ),
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Container(
              color: Colors.black,
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: CodaYoutubePlayer(
                  videoId: videoId,
                  autoPlay: true,
                  showControls: true,
                  mute: false,
                  loop: false,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              title,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                color: Colors.white70,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
