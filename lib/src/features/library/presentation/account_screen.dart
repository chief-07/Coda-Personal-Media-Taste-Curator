import 'dart:ui' as dart_ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/recommendation/application/audio_player_controller.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';

class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  final _maskScrollController = ScrollController();
  final _topScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
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



  void _showResetProfileDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.5),
      builder: (dialogCtx) => BackdropFilter(
        filter: dart_ui.ImageFilter.blur(sigmaX: 15, sigmaY: 15),
        child: Dialog(
          backgroundColor: Colors.transparent,
          elevation: 0,
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF16181C).withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.08),
                width: 1.5,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Logout & Reset Profile?',
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'This will permanently wipe your profile, recommendations, seen list, and not interested list.\n\nThis cannot be undone.',
                  style: GoogleFonts.inter(
                    color: Colors.white70,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogCtx),
                      child: Text(
                        'Cancel',
                        style: GoogleFonts.inter(
                          color: Colors.white70,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: () async {
                        Navigator.pop(dialogCtx);
                        // 1. Wipe local memory
                        await ref.read(livingMemoryProvider.notifier).clearMemory();
                        // 2. Pause audio
                        ref.read(audioPlayerControllerProvider.notifier).pause();
                        // 3. Clear active recommendation cache
                        await ref.read(homeRecommendationProvider.notifier).clearActivePick();
                        // 3.5 Clear active session recommendation
                        ref.read(activeSessionProvider.notifier).clear();
                        // 4. Redirect to onboarding
                        if (context.mounted) {
                          context.go('/onboarding');
                        }
                      },
                      child: Text(
                        'Reset',
                        style: GoogleFonts.inter(
                          color: const Color(0xFFE03E3E),
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeRec = ref.watch(homeRecommendationProvider).value;

    return Scaffold(
      backgroundColor: Colors.transparent,
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          // ── Layer 0: Global Background ────────────────────────────
          Positioned.fill(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 600),
              child: activeRec != null && activeRec.posterUrl != null && activeRec.posterUrl!.isNotEmpty
                  ? Transform.scale(
                      scale: 1.2,
                      child: ImageFiltered(
                        key: ValueKey(activeRec.posterUrl),
                        imageFilter: dart_ui.ImageFilter.blur(
                          sigmaX: 80,
                          sigmaY: 80,
                          tileMode: TileMode.mirror,
                        ),
                        child: FallbackImage(
                          url: activeRec.posterUrl,
                          fit: BoxFit.cover,
                          errorWidget: const SizedBox.shrink(),
                        ),
                      ),
                    )
                  : Transform.scale(
                      scale: 1.2,
                      key: const ValueKey('default_bg'),
                      child: ImageFiltered(
                        imageFilter: dart_ui.ImageFilter.blur(
                          sigmaX: 80,
                          sigmaY: 80,
                          tileMode: TileMode.mirror,
                        ),
                        child: const Image(
                          image: AssetImage('assets/images/default_bg.jpg'),
                          fit: BoxFit.cover,
                          width: double.infinity,
                          height: double.infinity,
                        ),
                      ),
                    ),
            ),
          ),
          Positioned.fill(
            child: Container(color: Colors.white.withValues(alpha: 0.15)),
          ),

          // ── Layer 1: Full-screen Knockout mask ──────────────────────
          Positioned.fill(
            child: ShaderMask(
              shaderCallback: (Rect bounds) {
                return LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.75),
                    Colors.black.withValues(alpha: 0.75),
                    Colors.black.withValues(alpha: 0.50),
                  ],
                  stops: const [0.0, 0.65, 1.0],
                ).createShader(bounds);
              },
              blendMode: BlendMode.srcOut,
              child: Container(
                color: Colors.black.withValues(alpha: 0.01),
                child: _buildScrollableBody(
                  isKnockoutLayer: true,
                  scrollController: _maskScrollController,
                ),
              ),
            ),
          ),

          // ── Layer 2: Normal visible elements ──────────────────────
          Positioned.fill(
            child: _buildScrollableBody(
              isKnockoutLayer: false,
              scrollController: _topScrollController,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScrollableBody({
    required bool isKnockoutLayer,
    required ScrollController scrollController,
  }) {
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          // Back Button & Title Row
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              children: [
                GestureDetector(
                  onTap: isKnockoutLayer ? null : () => context.pop(),
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isKnockoutLayer ? Colors.black : Colors.white.withValues(alpha: 0.08),
                      border: isKnockoutLayer
                          ? Border.all(color: Colors.black, width: 1.5)
                          : Border.all(color: Colors.white.withValues(alpha: 0.12)),
                    ),
                    child: isKnockoutLayer
                        ? null
                        : const Icon(
                            PhosphorIconsBold.caretLeft,
                            color: Colors.white,
                            size: 20,
                          ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: isKnockoutLayer
                      ? Text(
                          'Account',
                          style: GoogleFonts.inter(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: Colors.black,
                          ),
                        )
                      : Opacity(
                          opacity: 0,
                          child: Text(
                            'Account',
                            style: GoogleFonts.inter(
                              fontSize: 24,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          // Main scroll area
          Expanded(
            child: ListView(
              controller: scrollController,
              physics: isKnockoutLayer ? const NeverScrollableScrollPhysics() : const BouncingScrollPhysics(),
              padding: const EdgeInsets.only(bottom: 64),
              children: [
                // Logout/Reset Row
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                  child: isKnockoutLayer
                      ? Text(
                          'LOGOUT & RESET PROFILE',
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            fontWeight: FontWeight.w900,
                            color: Colors.black,
                            letterSpacing: 1.5,
                          ),
                        )
                      : Opacity(
                          opacity: 0.6,
                          child: Text(
                            'LOGOUT & RESET PROFILE',
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                              letterSpacing: 1.5,
                            ),
                          ),
                        ),
                ),

                _buildResetRow(
                  isKnockoutLayer,
                  onTap: () => _showResetProfileDialog(context, ref),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }



  Widget _buildResetRow(
    bool isKnockoutLayer, {
    VoidCallback? onTap,
  }) {
    final rowContent = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          isKnockoutLayer
              ? Text(
                  'Logout & Reset',
                  style: GoogleFonts.inter(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: Colors.black,
                    letterSpacing: 0.5,
                  ),
                )
              : Opacity(
                  opacity: 0,
                  child: Text(
                    'Logout & Reset',
                    style: GoogleFonts.inter(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
          isKnockoutLayer
              ? const SizedBox(width: 24, height: 24)
              : const Icon(
                  PhosphorIconsBold.signOut,
                  color: Color(0xFFE03E3E),
                  size: 24,
                ),
        ],
      ),
    );

    if (onTap == null || isKnockoutLayer) {
      return rowContent;
    }

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: rowContent,
    );
  }
}
