import 'dart:math' as math;
import 'dart:async';
import 'dart:ui';

import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/presentation/widgets/media_type_tab_bar.dart';
import 'package:coda/src/features/home/presentation/widgets/recommendation_card.dart';
import 'package:coda/src/features/recommendation/application/audio_player_controller.dart';
import 'package:coda/src/features/recommendation/data/recommendation_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';
import 'package:coda/src/core/providers/watchlist_mode_provider.dart';
import 'package:coda/src/core/providers/audio_enabled_provider.dart';
import 'package:coda/src/core/providers/memories_mode_provider.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(audioPlayerControllerProvider.notifier).setHomeActive(true);
      ref.read(homeRecommendationProvider.notifier).ensureBackgroundTasksForHome();
    });
  }

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

  void _onDeleteType(MediaType type) {
    showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.5),
      builder: (dialogCtx) => BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
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
                  'Remove Category?',
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Are you sure you want to remove "${type == MediaType.visualNovel ? "Visual Novel" : type.label}" from your tabs? You can add it back later.',
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
                      onPressed: () => Navigator.of(dialogCtx).pop(),
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
                        Navigator.of(dialogCtx).pop();
                        await _performDeleteType(type);
                      },
                      child: Text(
                        'Remove',
                        style: GoogleFonts.inter(
                          color: const Color(0xFFFF3B5C),
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

  void _showGlassSnackBar(BuildContext context, String message, {String icon = '🦭 '}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        padding: EdgeInsets.zero,
        duration: const Duration(seconds: 4),
        content: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.22),
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.25),
                    blurRadius: 18,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Text(icon, style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      message,
                      style: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.2,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _performDeleteType(MediaType type) async {
    final prefs = ref.read(sharedPreferencesProvider);
    final currentChips = prefs.getStringList('coda_onboarding_chips') ?? [];
    
    final normalizedLabelTarget = (type == MediaType.visualNovel ? 'Visual Novel' : type.label).replaceAll(RegExp(r'[\s_\-]'), '').toLowerCase();
    final normalizedNameTarget = type.name.replaceAll(RegExp(r'[\s_\-]'), '').toLowerCase();
    
    final updatedChips = currentChips.where((chip) {
      final normalizedChip = chip.replaceAll(RegExp(r'[\s_\-]'), '').toLowerCase();
      return normalizedChip != normalizedLabelTarget && normalizedChip != normalizedNameTarget;
    }).toList();

    if (updatedChips.length == currentChips.length) {
      // Nothing was removed (shouldn't happen, but just in case)
      return;
    }

    if (updatedChips.isEmpty) {
      if (mounted) {
        _showGlassSnackBar(context, 'You must keep at least one category.', icon: '⚠️ ');
      }
      return;
    }

    await prefs.setStringList('coda_onboarding_chips', updatedChips);
    
    // Invalidate onboarding controller to reload chips
    ref.invalidate(onboardingControllerProvider);

    // If we deleted the currently selected tab, select the first remaining active tab
    final activeTypes = ref.read(activeMediaTypesProvider);
    if (type == ref.read(selectedMediaTypeProvider)) {
      final remainingTypes = activeTypes.where((t) => t != type).toList();
      if (remainingTypes.isNotEmpty) {
        _onTypeSelected(remainingTypes.first);
      }
    }
    
    if (mounted) {
      _showGlassSnackBar(context, 'Removed "${type == MediaType.visualNovel ? "Visual Novel" : type.label}" category.', icon: '🗑️ ');
    }
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
    if (!ref.read(memoriesModeProvider)) {
      ref.read(homeRecommendationProvider.notifier).reload();
      _showGlassSnackBar(
        context,
        'Walrus Memory is OFF — skipped "${rec.title}" without learning why (feedback not saved)',
        icon: '🧠 ',
      );
      return;
    }
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

    ref.read(homeRecommendationProvider.notifier).reload();

    setState(() {
      _dragOffset = 0;
      _isAnimatingOut = false;
      _isDeepSwipeAnimating = false;
    });

    final memoriesEnabled = ref.read(memoriesModeProvider);
    if (!memoriesEnabled) {
      if (mounted) {
        _showGlassSnackBar(
          context,
          'Walrus Memory is OFF — skipped "${rec.title}" (rejection not saved to memory)',
          icon: '🧠 ',
        );
      }
      return;
    }

    if (mounted) {
      _showGlassSnackBar(context, 'Got it — skipping "${rec.title}"', icon: '⏭️ ');
    }

    unawaited(() async {
      try {
        final updates = MemoryUpdates(
          guardrailsAppends: ['Avoid: ${rec.title} (rejected)'],
          notForMeAppends: [rec.title],
        );
        await ref.read(livingMemoryProvider.notifier).applyUpdates(updates);
      } catch (e) {
        debugPrint('Error updating rejected list: $e');
      }
    }());
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

    // Immediately reload & advance next card so it never bounces back
    ref.read(homeRecommendationProvider.notifier).reload();

    setState(() {
      _dragOffset = 0;
      _isAnimatingOut = false;
      _isDeepSwipeAnimating = false;
    });

    final memoriesEnabled = ref.read(memoriesModeProvider);
    if (!memoriesEnabled) {
      if (mounted) {
        _showGlassSnackBar(
          context,
          'Walrus Memory is OFF — "${rec.title}" was not saved as watched (may be recommended again)',
          icon: '🧠 ',
        );
      }
      return;
    }

    // Run Walrus persistence and SnackBar in background
    unawaited(() async {
      try {
        final updates = MemoryUpdates(
          guardrailsAppends: ['Already watched: ${rec.title}'],
          seenAppends: [rec.title],
        );
        await ref.read(livingMemoryProvider.notifier).applyUpdates(updates);

        final savedMem = await ref.read(recommendationServiceProvider).submitSwipe(
          title: rec.title,
          action: 'seen',
        );

        if (mounted) {
          _showGlassSnackBar(
            context,
            savedMem != null ? 'Saved to Walrus: $savedMem' : 'Marked "${rec.title}" as seen in Walrus guardrails',
          );
        }
      } catch (e) {
        debugPrint('Error updating seen list: $e');
      }
    }());
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

    // Immediately reload & advance next card so it never bounces back
    ref.read(homeRecommendationProvider.notifier).reload();

    setState(() {
      _dragOffset = 0;
      _isAnimatingOut = false;
      _isDeepSwipeAnimating = false;
    });

    final memoriesEnabled = ref.read(memoriesModeProvider);
    if (!memoriesEnabled) {
      if (mounted) {
        _showGlassSnackBar(
          context,
          'Walrus Memory is OFF — Loved "${rec.title}", but taste memory was not saved',
          icon: '🧠 ',
        );
      }
      return;
    }

    // Run Walrus persistence and SnackBar in background
    unawaited(() async {
      try {
        final updates = MemoryUpdates(
          globalIdentityAppends: ['Highly values: ${rec.title} (loved work)'],
          categoryAppends: {
            rec.mediaType.name: ['Loved: ${rec.title} (excellent match)'],
          },
          seenAppends: [rec.title],
        );
        await ref.read(livingMemoryProvider.notifier).applyUpdates(updates);
        
        final savedMem = await ref.read(recommendationServiceProvider).submitSwipe(
          title: rec.title,
          action: 'loved',
        );

        if (mounted) {
          _showGlassSnackBar(
            context,
            savedMem != null ? 'Saved to Walrus: $savedMem' : 'Loved "${rec.title}"! Coda reinforced your tastes ❤️',
          );
        }
      } catch (e) {
        debugPrint('Error updating loved taste memory: $e');
      }
    }());
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
            'Avoid: ${rec.title} ($reason)',
          ],
          seenAppends: updates.seenAppends,
          notForMeAppends: [
            ...updates.notForMeAppends,
            rec.title,
          ],
          savedMemory: updates.savedMemory,
        );

        await ref.read(livingMemoryProvider.notifier).applyUpdates(finalUpdates);
        debugPrint('Successfully completed background taste refinement for "${rec.title}"');

        if (mounted) {
          _showGlassSnackBar(
            context,
            updates.savedMemory != null
                ? 'Saved to Walrus: ${updates.savedMemory}'
                : 'Avoided "${rec.title}" in Walrus guardrails',
          );
        }
      }
    } catch (e) {
      debugPrint('Background taste refinement failed: $e');
    }
  }

  void _showFeedbackSheet(Recommendation rec) {
    if (!ref.read(memoriesModeProvider)) {
      _showGlassSnackBar(
        context,
        'Walrus Memory is OFF — cannot refine taste without memory',
        icon: '🧠 ',
      );
      return;
    }
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => _FeedbackSheet(
        recommendation: rec,
        onFeedbackSubmitted: (reason) async {
          Navigator.of(ctx).pop();
          
          // 1. Instantly clear active pick and queue (shows loading shimmer immediately)
          await ref.read(homeRecommendationProvider.notifier).clearActivePickQueue(rec.mediaType);

          if (mounted) {
            _showGlassSnackBar(context, 'Coda is refining your taste memory...', icon: '🦭 ');
          }

          final localUpdates = MemoryUpdates(
            guardrailsAppends: ['Avoid: ${rec.title} ($reason)'],
            notForMeAppends: [rec.title],
          );
          
          try {
            await ref.read(livingMemoryProvider.notifier).applyUpdates(localUpdates);
          } catch (e) {
            debugPrint('Error applying local feedback updates: $e');
          }

          // 2. Await the LLM taste refinement first so the next fetch uses the updated tastes
          await _runBackgroundRefinement(rec, reason);

          // 3. Reload to fetch a fresh recommendation from the backend
          ref.read(homeRecommendationProvider.notifier).reload();
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
      resizeToAvoidBottomInset: false,
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
                        onDeleteType: _onDeleteType,
                        onAddType: (newCategory) async {
                          final prefs = ref.read(sharedPreferencesProvider);
                          final currentChips = prefs.getStringList('coda_onboarding_chips') ?? [];
                          if (!currentChips.contains(newCategory)) {
                            final updatedChips = [...currentChips, newCategory];
                            await prefs.setStringList('coda_onboarding_chips', updatedChips);
                          }
                          
                          // Reload the Onboarding state to refresh chips list
                          ref.invalidate(onboardingControllerProvider);
                          
                          // Navigate to Taste Profile Onboarding screen specifically for this custom category
                          if (context.mounted) {
                            context.push('/taste-profile?customCategory=$newCategory');
                          }
                        },
                      ),
                    ),
                    if (ref.watch(audioEnabledProvider)) const _MusicTogglePill(),
                    const SizedBox(width: 16),
                  ],
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    layoutBuilder: (Widget? currentChild, List<Widget> previousChildren) {
                      return Stack(
                        fit: StackFit.expand,
                        children: <Widget>[
                          ...previousChildren,
                          if (currentChild != null) currentChild,
                        ],
                      );
                    },
                    transitionBuilder: (Widget child, Animation<double> animation) {
                      return FadeTransition(
                        opacity: animation,
                        child: child,
                      );
                    },
                    child: rec.when(
                      data: (data) {
                        if (data == null) {
                          return StaticCardFrame(
                            key: ValueKey('${selectedType.name}_empty'),
                            child: Center(
                              child: Consumer(
                                builder: (context, ref, child) {
                                  final isWatchlistMode = ref.watch(watchlistModeProvider);
                                  return Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 32),
                                    child: Text(
                                      isWatchlistMode
                                          ? 'No media in the watchlist. Add media or turn off Watchlist Mode.'
                                          : 'No recommendation for ${selectedType.label} yet.',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        color: Colors.white.withValues(alpha: 0.4),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                          );
                        }

                        final bool isSameType = data.mediaType == selectedType ||
                            data.mediaType.name.toLowerCase() == selectedType.name.toLowerCase() ||
                            data.mediaType.label.toLowerCase() == selectedType.label.toLowerCase();
                        if (!isSameType) {
                          return StaticCardFrame(
                            key: ValueKey('${selectedType.name}_thinking'),
                            child: Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const CircularProgressIndicator(
                                      color: Colors.white54),
                                  const SizedBox(height: 16),
                                  Text(
                                    'Coda is curating...',
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: 0.5),
                                      fontSize: 16,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }

                        return _SwipeableCard(
                          key: ValueKey('${selectedType.name}_loaded_${data.id}'),
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
                      loading: () => StaticCardFrame(
                        key: ValueKey('${selectedType.name}_loading'),
                        child: Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const CircularProgressIndicator(
                                  color: Colors.white54),
                              const SizedBox(height: 16),
                              Text(
                                    'Coda is curating...',
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: 0.5),
                                      fontSize: 16,
                                    ),
                                  ),
                            ],
                          ),
                        ),
                      ),
                      error: (e, st) => StaticCardFrame(
                        key: ValueKey('${selectedType.name}_error'),
                        child: Center(
                          child: Text(
                            "Couldn't fetch a pick right now.",
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.4),
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
        ],
      ),
    );
  }
}

class StaticCardFrame extends StatelessWidget {
  const StaticCardFrame({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(64),
      ),
      child: Stack(
        children: [
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
                      Colors.black.withValues(alpha: 0.50),
                    ],
                    stops: const [0.0, 0.65, 1.0],
                  ).createShader(bounds);
                },
                blendMode: BlendMode.srcOut,
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: Container(
                        color: Colors.black.withValues(alpha: 0.01),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: child,
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Swipeable Card Wrapper
// ─────────────────────────────────────────────────────────────────────────────

class _SwipeableCard extends ConsumerWidget {
  const _SwipeableCard({
    required this.recommendation,
    required this.dragOffset,
    required this.isAnimatingOut,
    required this.isDeepSwipeAnimating,
    required this.swipeThreshold,
    required this.onDragUpdate,
    required this.onDragEnd,
    super.key,
  });

  final Recommendation recommendation;
  final double dragOffset;
  final bool isAnimatingOut;
  final bool isDeepSwipeAnimating;
  final double swipeThreshold;
  final void Function(double dx) onDragUpdate;
  final VoidCallback onDragEnd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final double gapWidth = dragOffset.abs() * 0.85;
    final isRightSwipe = dragOffset > 0;
    final isWatchlistMode = ref.watch(watchlistModeProvider);

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
                child: Stack(
                  children: [
                    RecommendationCard(recommendation: recommendation),
                    if (isWatchlistMode)
                      Positioned(
                        top: 24,
                        right: 24,
                        child: GestureDetector(
                          onTap: () {
                            ref.read(watchlistModeProvider.notifier).toggle();
                            ref.read(homeRecommendationProvider.notifier).reload();
                          },
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(20),
                            child: BackdropFilter(
                              filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(PhosphorIconsBold.bookmarkSimple, size: 14, color: Colors.white),
                                    const SizedBox(width: 6),
                                    Text(
                                      'Watchlist Mode',
                                      style: GoogleFonts.inter(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    const Icon(PhosphorIconsBold.x, size: 12, color: Colors.white70),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
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

  static const _reasons = [
    ('already_seen', 'Already seen / played this'),
    ('wrong_genre', "Wrong genre for me right now"),
    ('too_mainstream', "Too mainstream / popular"),
    ('wrong_tone', "Wrong tone — not in the mood"),
    ('not_my_style', "Just not my style"),
  ];

  @override
  void dispose() {
    _customController.dispose();
    super.dispose();
  }

  void _onReasonTap(String key) {
    setState(() {
      if (_selectedReason == key) {
        _selectedReason = null;
      } else {
        _selectedReason = key;
      }
    });
    HapticFeedback.selectionClick();
  }

  void _submit() {
    String reason = '';
    final customText = _customController.text.trim();
    final selectedChip = _selectedReason != null
        ? _reasons.firstWhere((r) => r.$1 == _selectedReason, orElse: () => ('', '')).$2
        : '';

    if (selectedChip.isNotEmpty && customText.isNotEmpty) {
      reason = '$selectedChip — $customText';
    } else if (customText.isNotEmpty) {
      reason = customText;
    } else if (selectedChip.isNotEmpty) {
      reason = selectedChip;
    }

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
                "This updates your decentralized Walrus taste memory.",
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

              const SizedBox(height: 16),

              // Custom input always available
              TextField(
                controller: _customController,
                style: GoogleFonts.inter(color: Colors.white, fontSize: 14),
                cursorColor: Colors.white,
                decoration: InputDecoration(
                  hintText: 'Or tell Coda specifically what didn\'t fit...',
                  hintStyle: GoogleFonts.inter(
                    color: Colors.white.withValues(alpha: 0.38),
                    fontSize: 13,
                  ),
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.06),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(
                      color: Colors.white.withValues(alpha: 0.12),
                    ),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(
                      color: Colors.white.withValues(alpha: 0.12),
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(
                      color: Colors.white.withValues(alpha: 0.35),
                    ),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                ),
                onSubmitted: (_) => _submit(),
              ),

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
