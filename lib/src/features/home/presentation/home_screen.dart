import 'dart:math' as math;
import 'dart:ui';

import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/presentation/widgets/media_type_tab_bar.dart';
import 'package:coda/src/features/home/presentation/widgets/recommendation_card.dart';
import 'package:coda/src/features/recommendation/application/audio_player_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with SingleTickerProviderStateMixin {
  double _dragOffset = 0;
  bool _isAnimatingOut = false;
  bool _isDeepSwipeAnimating = false;
  static const double _swipeThreshold = 110;

  int _calculateSwipeLevel(double offset) {
    final absOffset = offset.abs();
    if (absOffset >= 160) return 2;
    if (absOffset >= 80) return 1;
    return 0;
  }

  void _onTypeSelected(MediaType type) {
    ref.read(selectedMediaTypeProvider.notifier).select(type);
    setState(() => _dragOffset = 0);
  }

  // LEFT SWIPE (DEEP) — "Not for me" + open reasons sheet
  Future<void> _onSwipeLeft(Recommendation rec) async {
    HapticFeedback.mediumImpact();
    setState(() {
      _isAnimatingOut = true;
      _dragOffset = -500;
    });
    await Future.delayed(const Duration(milliseconds: 280));
    if (!mounted) return;
    setState(() {
      _dragOffset = 0;
      _isAnimatingOut = false;
      _isDeepSwipeAnimating = false;
    });
    _showFeedbackSheet(rec);
  }

  // LEFT SWIPE (MODERATE) — "Not for me" quick silent skip
  Future<void> _onSwipeLeftQuick(Recommendation rec) async {
    HapticFeedback.lightImpact();
    setState(() {
      _isAnimatingOut = true;
      _dragOffset = -500;
    });
    await Future.delayed(const Duration(milliseconds: 280));
    if (!mounted) return;
    setState(() {
      _dragOffset = 0;
      _isAnimatingOut = false;
      _isDeepSwipeAnimating = false;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Got it — skipping "${rec.title}"'),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          backgroundColor: Colors.white.withValues(alpha: 0.12),
          duration: const Duration(seconds: 2),
        ),
      );
    }

    try {
      final updates = MemoryUpdates(
        guardrailsAppends: ['Avoid: ${rec.title} (rejected)'],
        notForMeAppends: [rec.title],
      );
      await ref.read(livingMemoryProvider.notifier).applyUpdates(updates);
    } catch (e) {
      debugPrint('Error updating rejected list: $e');
    }

    ref.read(homeRecommendationProvider.notifier).reload();
  }

  // RIGHT SWIPE (MODERATE) — "Already watched/played this" quick seen skip
  Future<void> _onSwipeRight(Recommendation rec) async {
    HapticFeedback.lightImpact();
    setState(() {
      _isAnimatingOut = true;
      _dragOffset = 500;
    });
    await Future.delayed(const Duration(milliseconds: 280));
    if (!mounted) return;
    setState(() {
      _dragOffset = 0;
      _isAnimatingOut = false;
      _isDeepSwipeAnimating = false;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Got it — marked "${rec.title}" as seen'),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          backgroundColor: Colors.white.withValues(alpha: 0.12),
          duration: const Duration(seconds: 2),
        ),
      );
    }

    try {
      final updates = MemoryUpdates(
        guardrailsAppends: ['Already watched: ${rec.title}'],
        seenAppends: [rec.title],
      );
      await ref.read(livingMemoryProvider.notifier).applyUpdates(updates);
    } catch (e) {
      debugPrint('Error updating seen list: $e');
    }

    ref.read(homeRecommendationProvider.notifier).reload();
  }

  // RIGHT SWIPE (DEEP) — "Loved it" + positive taste reinforcement
  Future<void> _onSwipeRightLoved(Recommendation rec) async {
    HapticFeedback.heavyImpact();
    setState(() {
      _isAnimatingOut = true;
      _dragOffset = 500;
    });
    await Future.delayed(const Duration(milliseconds: 280));
    if (!mounted) return;
    setState(() {
      _dragOffset = 0;
      _isAnimatingOut = false;
      _isDeepSwipeAnimating = false;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Loved "${rec.title}"! Coda reinforced your tastes ❤️'),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          backgroundColor: Colors.white.withValues(alpha: 0.15),
          duration: const Duration(seconds: 2),
        ),
      );
    }

    try {
      final updates = MemoryUpdates(
        globalIdentityAppends: ['Highly values: ${rec.title} (loved work)'],
        categoryAppends: {
          rec.mediaType.name: ['Loved: ${rec.title} (excellent match)'],
        },
        seenAppends: [rec.title],
      );
      await ref.read(livingMemoryProvider.notifier).applyUpdates(updates);
    } catch (e) {
      debugPrint('Error updating loved taste memory: $e');
    }

    ref.read(homeRecommendationProvider.notifier).reload();
  }

  Future<void> _runBackgroundRefinement(Recommendation rec, String reason) async {
    try {
      final memory = ref.read(livingMemoryProvider);
      final service = ref.read(recommendationServiceProvider);
      
      final updates = await service.refineTaste(
        memory: memory,
        title: rec.title,
        mediaType: rec.mediaType.name,
        reason: reason,
      );

      if (updates != null) {
        final finalUpdates = MemoryUpdates(
          globalIdentityAppends: updates.globalIdentityAppends,
          categoryAppends: updates.categoryAppends,
          recentContextOverwrite: updates.recentContextOverwrite,
          guardrailsAppends: [
            ...updates.guardrailsAppends,
            'Avoid: ${rec.title} (rejected)',
          ],
          seenAppends: updates.seenAppends,
          notForMeAppends: [
            ...updates.notForMeAppends,
            rec.title,
          ],
        );

        await ref.read(livingMemoryProvider.notifier).applyUpdates(finalUpdates);
        debugPrint('Successfully completed background taste refinement for "${rec.title}"');
      }
    } catch (e) {
      debugPrint('Background taste refinement failed: $e');
    }
  }

  void _showFeedbackSheet(Recommendation rec) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => _FeedbackSheet(
        recommendation: rec,
        onFeedbackSubmitted: (reason) async {
          Navigator.of(ctx).pop();
          
          final localUpdates = MemoryUpdates(
            guardrailsAppends: ['Avoid: ${rec.title} (rejected)'],
            notForMeAppends: [rec.title],
          );
          
          try {
            await ref.read(livingMemoryProvider.notifier).applyUpdates(localUpdates);
          } catch (e) {
            debugPrint('Error applying local feedback updates: $e');
          }

          ref.read(homeRecommendationProvider.notifier).reload();

          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text('Getting a better pick...'),
                behavior: SnackBarBehavior.floating,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                backgroundColor: Colors.white.withValues(alpha: 0.12),
                duration: const Duration(seconds: 1),
              ),
            );
          }

          // Trigger remote LLM refinement in the background without blocking the UI
          _runBackgroundRefinement(rec, reason);
        },
        onSkip: () {
          Navigator.of(ctx).pop();
          ref.read(homeRecommendationProvider.notifier).reload();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeTypes = ref.watch(activeMediaTypesProvider);
    final selectedType = ref.watch(selectedMediaTypeProvider);
    final rec = ref.watch(homeRecommendationProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: MediaTypeTabBar(
                        types: activeTypes,
                        selected: selectedType,
                        onSelected: _onTypeSelected,
                      ),
                    ),
                    const _MusicTogglePill(),
                    const SizedBox(width: 16),
                  ],
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: rec.when(
                    data: (data) {
                      if (data == null) {
                        return Center(
                          child: Text(
                            'No recommendation for ${selectedType.label} yet.',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.4),
                            ),
                          ),
                        );
                      }

                      if (data.mediaType != selectedType) {
                        return Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const CircularProgressIndicator(
                                  color: Colors.white54),
                              const SizedBox(height: 16),
                              Text(
                                'Coda is thinking...',
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.5),
                                  fontSize: 16,
                                ),
                              ),
                            ],
                          ),
                        );
                      }

                      return _SwipeableCard(
                        recommendation: data,
                        dragOffset: _dragOffset,
                        isAnimatingOut: _isAnimatingOut,
                        isDeepSwipeAnimating: _isDeepSwipeAnimating,
                        swipeThreshold: _swipeThreshold,
                        onDragUpdate: (dx) {
                          if (!_isAnimatingOut) {
                            final oldOffset = _dragOffset;
                            final newOffset = _dragOffset + dx;
                            final oldLevel = _calculateSwipeLevel(oldOffset);
                            final newLevel = _calculateSwipeLevel(newOffset);
                            
                            if (oldLevel != newLevel && newLevel > 0) {
                              if (newLevel == 1) {
                                HapticFeedback.selectionClick();
                              } else if (newLevel == 2) {
                                HapticFeedback.mediumImpact();
                              }
                            }
                            setState(() => _dragOffset = newOffset);
                          }
                        },
                        onDragEnd: () {
                          if (_isAnimatingOut) return;
                          if (_dragOffset <= -160) {
                            setState(() => _isDeepSwipeAnimating = true);
                            _onSwipeLeft(data); // Deep Left: open feedback reasons sheet
                          } else if (_dragOffset <= -80) {
                            setState(() => _isDeepSwipeAnimating = false);
                            _onSwipeLeftQuick(data); // Moderate Left: quick silent skip
                          } else if (_dragOffset >= 160) {
                            setState(() => _isDeepSwipeAnimating = true);
                            _onSwipeRightLoved(data); // Deep Right: Loved it!
                          } else if (_dragOffset >= 80) {
                            setState(() => _isDeepSwipeAnimating = false);
                            _onSwipeRight(data); // Moderate Right: Seen it quick skip
                          } else {
                            setState(() {
                              _dragOffset = 0;
                              _isDeepSwipeAnimating = false;
                            });
                          }
                        },
                      );
                    },
                    loading: () => Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const CircularProgressIndicator(
                              color: Colors.white54),
                          const SizedBox(height: 16),
                          Text(
                            'Coda is thinking...',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.5),
                              fontSize: 16,
                            ),
                          ),
                        ],
                      ),
                    ),
                    error: (e, st) => Center(
                      child: Text(
                        "Couldn't fetch a pick right now.",
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.4),
                        ),
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

// ─────────────────────────────────────────────────────────────────────────────
// Swipeable Card Wrapper
// ─────────────────────────────────────────────────────────────────────────────

class _SwipeableCard extends StatelessWidget {
  const _SwipeableCard({
    required this.recommendation,
    required this.dragOffset,
    required this.isAnimatingOut,
    required this.isDeepSwipeAnimating,
    required this.swipeThreshold,
    required this.onDragUpdate,
    required this.onDragEnd,
  });

  final Recommendation recommendation;
  final double dragOffset;
  final bool isAnimatingOut;
  final bool isDeepSwipeAnimating;
  final double swipeThreshold;
  final void Function(double dx) onDragUpdate;
  final VoidCallback onDragEnd;

  @override
  Widget build(BuildContext context) {
    final double gapWidth = dragOffset.abs() * 0.85;
    final isRightSwipe = dragOffset > 0;

    return LayoutBuilder(
      builder: (context, constraints) {
        final parentWidth = constraints.maxWidth;

        return Stack(
          clipBehavior: Clip.none,
          children: [
            // ── The Moving Card (Rendered first, underneath) ──
            GestureDetector(
              onHorizontalDragUpdate: (details) => onDragUpdate(details.delta.dx),
              onHorizontalDragEnd: (_) => onDragEnd(),
              child: AnimatedContainer(
                duration: (isAnimatingOut || dragOffset == 0)
                    ? const Duration(milliseconds: 300)
                    : Duration.zero,
                curve: isAnimatingOut ? Curves.easeIn : Curves.easeOut,
                transform: Matrix4.translationValues(dragOffset * 0.85, 0, 0)
                  ..rotateZ(dragOffset * 0.0004),
                child: RecommendationCard(recommendation: recommendation),
              ),
            ),

            // ── Action Pills Anchored Directly Beside the Card (Rendered second, on top) ──
            if (gapWidth > 15 && !isAnimatingOut)
              Positioned(
                left: isRightSwipe ? null : parentWidth + (dragOffset * 0.85) + 12,
                right: isRightSwipe ? parentWidth - (dragOffset * 0.85) + 12 : null,
                top: 0,
                bottom: 0,
                child: Center(
                  child: _BackgroundActionPills(
                    dragOffset: dragOffset,
                    swipeThreshold: swipeThreshold,
                    isAnimatingOut: isAnimatingOut,
                    isDeepActive: isDeepSwipeAnimating,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _BackgroundActionPills extends StatelessWidget {
  const _BackgroundActionPills({
    required this.dragOffset,
    required this.swipeThreshold,
    required this.isAnimatingOut,
    required this.isDeepActive,
  });

  final double dragOffset;
  final double swipeThreshold;
  final bool isAnimatingOut;
  final bool isDeepActive;

  @override
  Widget build(BuildContext context) {
    final isRightSwipe = dragOffset > 0;
    final isLeftSwipe = dragOffset < 0;
    
    final double offset = dragOffset.abs();

    if (offset < 15) return const SizedBox.shrink();

    // ── RIGHT SWIPE MATH (Seen + Loved It) ──
    double seenWidth = 0.0;
    double seenOpacity = 0.0;
    bool isSeenActive = false;

    double lovedWidth = 0.0;
    double lovedOpacity = 0.0;
    bool isLovedActive = false;

    if (isRightSwipe) {
      isSeenActive = offset >= 80;
      isLovedActive = offset >= 160;

      if (offset < 80) {
        seenWidth = (offset / 80.0 * 40.0).clamp(0.0, 40.0);
        seenOpacity = (offset / 80.0 * 0.25).clamp(0.0, 0.25);
        lovedWidth = 0.0;
        lovedOpacity = 0.0;
      } else {
        seenWidth = 40.0;
        seenOpacity = 1.0 - ((offset - 80) / 80.0 * 0.75).clamp(0.0, 0.75);
        lovedWidth = ((offset - 80) / 80.0 * 40.0).clamp(0.0, 40.0);
        lovedOpacity = isLovedActive ? 1.0 : ((offset - 80) / 80.0 * 0.25).clamp(0.0, 0.25);
      }
    }

    // ── LEFT SWIPE MATH (Wrong Pick + Why?) ──
    double notForMeWidth = 0.0;
    double notForMeOpacity = 0.0;
    bool isNotForMeActive = false;

    double whyWidth = 0.0;
    double whyOpacity = 0.0;
    bool isWhyActive = false;

    if (isLeftSwipe) {
      isNotForMeActive = offset >= 80;
      isWhyActive = offset >= 160;

      if (offset < 80) {
        notForMeWidth = (offset / 80.0 * 40.0).clamp(0.0, 40.0);
        notForMeOpacity = (offset / 80.0 * 0.25).clamp(0.0, 0.25);
        whyWidth = 0.0;
        whyOpacity = 0.0;
      } else {
        notForMeWidth = 40.0;
        notForMeOpacity = 1.0 - ((offset - 80) / 80.0 * 0.75).clamp(0.0, 0.75);
        whyWidth = ((offset - 80) / 80.0 * 40.0).clamp(0.0, 40.0);
        whyOpacity = isWhyActive ? 1.0 : ((offset - 80) / 80.0 * 0.25).clamp(0.0, 0.25);
      }
    }

    final showLovedGap = isRightSwipe && offset >= 80 && lovedWidth > 0;
    final showWhyGap = isLeftSwipe && offset >= 80 && whyWidth > 0;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isRightSwipe) ...[
          if (lovedWidth > 0) ...[
            _buildPill(
              width: lovedWidth,
              opacity: lovedOpacity,
              isActive: isLovedActive,
              icon: Icons.favorite_rounded,
            ),
            if (showLovedGap) const SizedBox(width: 8),
          ],
          _buildPill(
            width: seenWidth,
            opacity: seenOpacity,
            isActive: isSeenActive,
            icon: Icons.check_rounded,
          ),
        ],
        if (isLeftSwipe) ...[
          _buildPill(
            width: notForMeWidth,
            opacity: notForMeOpacity,
            isActive: isNotForMeActive,
            icon: Icons.close_rounded,
          ),
          if (showWhyGap) const SizedBox(width: 8),
          if (whyWidth > 0) ...[
            _buildPill(
              width: whyWidth,
              opacity: whyOpacity,
              isActive: isWhyActive,
              icon: Icons.help_outline_rounded,
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildPill({
    required double width,
    required double opacity,
    required bool isActive,
    required IconData icon,
  }) {
    if (width <= 0) return const SizedBox.shrink();

    return AnimatedContainer(
      duration: Duration.zero,
      width: width,
      height: 40,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: isActive ? 0.6 : 0.4),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Colors.white.withValues(alpha: isActive ? 0.4 : 0.12),
          width: isActive ? 1.5 : 1.0,
        ),
        boxShadow: isActive
            ? [
                BoxShadow(
                  color: Colors.white.withValues(alpha: 0.08),
                  blurRadius: 10,
                  spreadRadius: 1,
                )
              ]
            : null,
      ),
      child: Center(
        child: Opacity(
          opacity: opacity,
          child: Icon(icon, color: Colors.white, size: 18),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// "Why doesn't this fit?" Feedback Sheet
// ─────────────────────────────────────────────────────────────────────────────

class _FeedbackSheet extends StatefulWidget {
  const _FeedbackSheet({
    required this.recommendation,
    required this.onFeedbackSubmitted,
    required this.onSkip,
  });

  final Recommendation recommendation;
  final void Function(String reason) onFeedbackSubmitted;
  final VoidCallback onSkip;

  @override
  State<_FeedbackSheet> createState() => _FeedbackSheetState();
}

class _FeedbackSheetState extends State<_FeedbackSheet> {
  String? _selectedReason;
  final _customController = TextEditingController();
  bool _showCustomInput = false;

  static const _reasons = [
    ('already_seen', 'Already seen / played this'),
    ('wrong_genre', "Wrong genre for me right now"),
    ('too_mainstream', "Too mainstream / popular"),
    ('wrong_tone', "Wrong tone — not in the mood"),
    ('not_my_style', "Just not my style"),
    ('other', "Something else..."),
  ];

  @override
  void dispose() {
    _customController.dispose();
    super.dispose();
  }

  void _onReasonTap(String key) {
    setState(() {
      _selectedReason = key;
      _showCustomInput = key == 'other';
    });
    if (key != 'other') {
      HapticFeedback.selectionClick();
    }
  }

  void _submit() {
    final reason = _selectedReason == 'other'
        ? _customController.text.trim()
        : _reasons.firstWhere((r) => r.$1 == _selectedReason).$2;
    if (reason.isNotEmpty) {
      widget.onFeedbackSubmitted(reason);
    } else {
      widget.onSkip();
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom +
        MediaQuery.of(context).padding.bottom;

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          padding: EdgeInsets.fromLTRB(24, 12, 24, 80 + bottomPad),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.07),
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(32)),
            border: Border(
              top: BorderSide(
                color: Colors.white.withValues(alpha: 0.12),
              ),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 20),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              Text(
                "Why doesn't ${widget.recommendation.title} fit?",
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                "This helps Coda learn your taste.",
                style: GoogleFonts.inter(
                  color: Colors.white.withValues(alpha: 0.45),
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 20),

              // Reason chips
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: _reasons.map((r) {
                  final isSelected = _selectedReason == r.$1;
                  return GestureDetector(
                    onTap: () => _onReasonTap(r.$1),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? Colors.white.withValues(alpha: 0.15)
                            : Colors.white.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(50),
                        border: Border.all(
                          color: isSelected
                              ? Colors.white.withValues(alpha: 0.5)
                              : Colors.white.withValues(alpha: 0.12),
                          width: 1.5,
                        ),
                      ),
                      child: Text(
                        r.$2,
                        style: GoogleFonts.inter(
                          color: isSelected
                              ? Colors.white
                              : Colors.white.withValues(alpha: 0.65),
                          fontSize: 13,
                          fontWeight: isSelected
                              ? FontWeight.w700
                              : FontWeight.w500,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),

              // Custom input if "other" selected
              if (_showCustomInput) ...[
                const SizedBox(height: 16),
                TextField(
                  controller: _customController,
                  autofocus: true,
                  style: GoogleFonts.inter(
                      color: Colors.white, fontSize: 14),
                  cursorColor: Colors.white,
                  decoration: InputDecoration(
                    hintText: 'Tell Coda why...',
                    hintStyle: GoogleFonts.inter(
                        color: Colors.white38, fontSize: 14),
                    filled: true,
                    fillColor: Colors.white.withValues(alpha: 0.06),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                  ),
                ),
              ],

              const SizedBox(height: 24),

              // Action buttons
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: widget.onSkip,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.1),
                          ),
                        ),
                        child: Center(
                          child: Text(
                            'Skip',
                            style: GoogleFonts.inter(
                              color: Colors.white54,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: GestureDetector(
                      onTap: _submit,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.25),
                          ),
                        ),
                        child: Center(
                          child: Text(
                            'Submit',
                            style: GoogleFonts.inter(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Music Toggle Pill & Playing Indicator
// ─────────────────────────────────────────────────────────────────────────────

class _MusicTogglePill extends ConsumerWidget {
  const _MusicTogglePill();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audioState = ref.watch(audioPlayerControllerProvider);
    final isMuted = audioState.isMuted;
    final hasTrack = audioState.currentUrl != null && audioState.currentUrl!.isNotEmpty;
    final isPlaying = hasTrack && !isMuted;

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        ref.read(audioPlayerControllerProvider.notifier).toggleMute();
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(30),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isPlaying
                  ? Colors.white.withValues(alpha: 0.12)
                  : Colors.white.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(30),
              border: Border.all(
                color: isPlaying
                    ? Colors.white.withValues(alpha: 0.3)
                    : Colors.white.withValues(alpha: 0.08),
                width: 1,
              ),
              boxShadow: isPlaying
                  ? [
                      BoxShadow(
                        color: Colors.white.withValues(alpha: 0.08),
                        blurRadius: 12,
                        spreadRadius: 1,
                      ),
                    ]
                  : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  isPlaying ? Icons.music_note_rounded : Icons.music_off_rounded,
                  color: isPlaying ? Colors.white : Colors.white.withValues(alpha: 0.35),
                  size: 18,
                ),
                if (isPlaying) ...[
                  const SizedBox(width: 6),
                  const _PlayingIndicator(),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PlayingIndicator extends StatefulWidget {
  const _PlayingIndicator();

  @override
  State<_PlayingIndicator> createState() => _PlayingIndicatorState();
}

class _PlayingIndicatorState extends State<_PlayingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 12,
      width: 14,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(3, (index) {
          return AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              final t = _controller.value;
              final phase = index * (3.14159 / 3);
              final scale = 0.3 + 0.7 * (math.sin(t * 2 * 3.14159 + phase).abs());
              return Container(
                width: 2.5,
                height: 12 * scale,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.85),
                  borderRadius: BorderRadius.circular(1),
                ),
              );
            },
          );
        }),
      ),
    );
  }
}
