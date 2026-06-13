import 'dart:ui' as dart_ui;
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/core/providers/api_config.dart';

class CurrentSessionScreen extends ConsumerWidget {
  const CurrentSessionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recommendation =
        ref.watch(activeSessionProvider) ??
        ref.watch(homeRecommendationProvider).value;

    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;

    return Scaffold(
      backgroundColor: const Color(0xFF101114),
      body: Stack(
        children: [
          // ── Blurred poster backdrop ────────────────────────
          Positioned.fill(
            child: recommendation?.posterUrl != null &&
                    recommendation!.posterUrl!.isNotEmpty &&
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
            child: Container(color: Colors.black.withValues(alpha: 0.45)),
          ),

          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top header with Back Button
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      GestureDetector(
                        onTap: () {
                          ref.read(activeSessionProvider.notifier).clear();
                          context.go('/home');
                        },
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
                        'CURRENT SESSION',
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
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Centered Poster
                        if (recommendation?.posterUrl != null)
                          Center(
                            child: Container(
                              width: screenWidth * 0.52,
                              height: (screenWidth * 0.52) * 1.5,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(20),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.5),
                                    blurRadius: 25,
                                    offset: const Offset(0, 10),
                                  ),
                                ],
                              ),
                              child: Hero(
                                tag: 'poster_${recommendation?.id}',
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(20),
                                  child: FallbackImage(
                                    url: recommendation?.posterUrl,
                                    fit: BoxFit.cover,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        const SizedBox(height: 32),

                        // Title Text
                        Text(
                          recommendation?.title ?? 'Nothing Active',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 26,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                            height: 1.2,
                          ),
                        ),
                        const SizedBox(height: 8),

                        // Label
                        Text(
                          'Currently experiencing this recommendation',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.inter(
                            color: Colors.white60,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 48),
                      ],
                    ),
                  ),
                ),

                // "I am finished, let's talk" Button
                Padding(
                  padding: EdgeInsets.only(
                    left: 24,
                    right: 24,
                    bottom: MediaQuery.of(context).padding.bottom + 24,
                  ),
                  child: GestureDetector(
                    onTap: () {
                      // Navigate to discussion chat
                      context.go('/session-chat');
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
                          const Icon(PhosphorIconsBold.chats, color: Colors.black, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            "I'm finished, let's talk",
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
          ),
        ],
      ),
    );
  }
}
