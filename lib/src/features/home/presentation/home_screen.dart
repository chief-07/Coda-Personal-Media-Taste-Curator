import 'dart:ui';

import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/presentation/widgets/media_type_tab_bar.dart';
import 'package:coda/src/features/home/presentation/widgets/recommendation_card.dart';
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
  static const double _swipeThreshold = 110;

  // Swipe direction overlay opacity
  double get _leftOverlayOpacity =>
      (_dragOffset < 0 ? (-_dragOffset / _swipeThreshold).clamp(0.0, 1.0) : 0.0);
  double get _rightOverlayOpacity =>
      (_dragOffset > 0 ? (_dragOffset / _swipeThreshold).clamp(0.0, 1.0) : 0.0);

  void _onTypeSelected(MediaType type) {
    ref.read(selectedMediaTypeProvider.notifier).select(type);
    setState(() => _dragOffset = 0);
  }

  // LEFT SWIPE — "This doesn't fit"
  Future<void> _onSwipeLeft(Recommendation rec) async {
    HapticFeedback.mediumImpact();
    // Animate card off screen left
    setState(() {
      _isAnimatingOut = true;
      _dragOffset = -500;
    });
    await Future.delayed(const Duration(milliseconds: 280));
    if (!mounted) return;
    setState(() {
      _dragOffset = 0;
      _isAnimatingOut = false;
    });
    // Show "why not?" feedback sheet
    _showFeedbackSheet(rec);
  }

  // RIGHT SWIPE — "Already watched/played this"
  Future<void> _onSwipeRight(Recommendation rec) async {
    HapticFeedback.lightImpact();
    // Animate card off screen right
    setState(() {
      _isAnimatingOut = true;
      _dragOffset = 500;
    });
    await Future.delayed(const Duration(milliseconds: 280));
    if (!mounted) return;
    setState(() {
      _dragOffset = 0;
      _isAnimatingOut = false;
    });
    // Show "already watched" toast and fetch next
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
        guardrailsAppends: ['Already watched: ${rec.title}'],
      );
      await ref.read(livingMemoryProvider.notifier).applyUpdates(updates);
    } catch (e) {
      debugPrint('Error updating seen list: $e');
    }

    ref.read(homeRecommendationProvider.notifier).reload();
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
          
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Refining your profile for "${rec.title}"...'),
                behavior: SnackBarBehavior.floating,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                backgroundColor: Colors.white.withValues(alpha: 0.12),
                duration: const Duration(seconds: 1),
              ),
            );
          }

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
              await ref.read(livingMemoryProvider.notifier).applyUpdates(updates);
            }
          } catch (e) {
            debugPrint('Error applying feedback updates: $e');
          }

          ref.read(homeRecommendationProvider.notifier).reload();
          
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text("Profile refined — getting a better pick..."),
                behavior: SnackBarBehavior.floating,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                backgroundColor: Colors.white.withValues(alpha: 0.12),
                duration: const Duration(seconds: 2),
              ),
            );
          }
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
                MediaTypeTabBar(
                  types: activeTypes,
                  selected: selectedType,
                  onSelected: _onTypeSelected,
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: rec.when(
                    data: (data) => data != null
                        ? _SwipeableCard(
                            recommendation: data,
                            dragOffset: _dragOffset,
                            isAnimatingOut: _isAnimatingOut,
                            leftOverlayOpacity: _leftOverlayOpacity,
                            rightOverlayOpacity: _rightOverlayOpacity,
                            swipeThreshold: _swipeThreshold,
                            onDragUpdate: (dx) {
                              if (!_isAnimatingOut) {
                                setState(() => _dragOffset += dx);
                              }
                            },
                            onDragEnd: () {
                              if (_isAnimatingOut) return;
                              if (_dragOffset < -_swipeThreshold) {
                                _onSwipeLeft(data);
                              } else if (_dragOffset > _swipeThreshold) {
                                _onSwipeRight(data);
                              } else {
                                setState(() => _dragOffset = 0);
                              }
                            },
                          )
                        : Center(
                            child: Text(
                              'No recommendation for ${selectedType.label} yet.',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.4),
                              ),
                            ),
                          ),
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
    required this.leftOverlayOpacity,
    required this.rightOverlayOpacity,
    required this.swipeThreshold,
    required this.onDragUpdate,
    required this.onDragEnd,
  });

  final Recommendation recommendation;
  final double dragOffset;
  final bool isAnimatingOut;
  final double leftOverlayOpacity;
  final double rightOverlayOpacity;
  final double swipeThreshold;
  final void Function(double dx) onDragUpdate;
  final VoidCallback onDragEnd;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onHorizontalDragUpdate: (details) => onDragUpdate(details.delta.dx),
      onHorizontalDragEnd: (_) => onDragEnd(),
      child: AnimatedContainer(
        duration: (isAnimatingOut || dragOffset == 0)
            ? const Duration(milliseconds: 300)
            : Duration.zero,
        curve: isAnimatingOut ? Curves.easeIn : Curves.easeOut,
        transform: Matrix4.translationValues(dragOffset * 0.85, 0, 0)
          ..rotateZ(dragOffset * 0.0004),
        child: Stack(
          children: [
            RecommendationCard(recommendation: recommendation),

            // ── Left swipe hint: "Not for me" ───────────────────────────
            if (leftOverlayOpacity > 0)
              Positioned.fill(
                child: IgnorePointer(
                  child: ClipRRect(
                    borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(64)),
                    child: AnimatedOpacity(
                      opacity: leftOverlayOpacity,
                      duration: Duration.zero,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.centerRight,
                            end: Alignment.centerLeft,
                            colors: [
                              Colors.transparent,
                              const Color(0xFFFF3B5C).withValues(alpha: 0.35),
                            ],
                          ),
                        ),
                        child: Align(
                          alignment: const Alignment(-0.7, -0.2),
                          child: _SwipeLabel(
                            label: 'NOT FOR ME',
                            icon: Icons.close_rounded,
                            color: const Color(0xFFFF3B5C),
                            opacity: leftOverlayOpacity,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),

            // ── Right swipe hint: "Seen it" ──────────────────────────────
            if (rightOverlayOpacity > 0)
              Positioned.fill(
                child: IgnorePointer(
                  child: ClipRRect(
                    borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(64)),
                    child: AnimatedOpacity(
                      opacity: rightOverlayOpacity,
                      duration: Duration.zero,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                            colors: [
                              Colors.transparent,
                              const Color(0xFF34C759).withValues(alpha: 0.35),
                            ],
                          ),
                        ),
                        child: Align(
                          alignment: const Alignment(0.7, -0.2),
                          child: _SwipeLabel(
                            label: 'SEEN IT',
                            icon: Icons.check_rounded,
                            color: const Color(0xFF34C759),
                            opacity: rightOverlayOpacity,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SwipeLabel extends StatelessWidget {
  const _SwipeLabel({
    required this.label,
    required this.icon,
    required this.color,
    required this.opacity,
  });

  final String label;
  final IconData icon;
  final Color color;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return Transform.scale(
      scale: 0.7 + (opacity * 0.3),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.6), width: 2),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.inter(
                color: color,
                fontSize: 14,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.5,
              ),
            ),
          ],
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
          padding: EdgeInsets.fromLTRB(24, 12, 24, 24 + bottomPad),
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
                    flex: 2,
                    child: GestureDetector(
                      onTap: _selectedReason != null ? _submit : null,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        decoration: BoxDecoration(
                          color: _selectedReason != null
                              ? Colors.white
                              : Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Center(
                          child: Text(
                            'Get a better pick →',
                            style: GoogleFonts.inter(
                              color: _selectedReason != null
                                  ? Colors.black
                                  : Colors.white30,
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
