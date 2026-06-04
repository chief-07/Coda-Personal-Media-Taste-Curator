import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/presentation/widgets/media_type_tab_bar.dart';
import 'package:coda/src/features/home/presentation/widgets/recommendation_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  double _dragOffset = 0;
  static const double _swipeThreshold = 100;

  void _onTypeSelected(MediaType type) {
    ref.read(selectedMediaTypeProvider.notifier).select(type);
    setState(() => _dragOffset = 0);
  }

  void _onSwipeLeft() {
    setState(() => _dragOffset = 0);
    // TODO: load next recommendation for this type.
  }

  void _onSwipeRight() {
    final rec = ref.read(homeRecommendationProvider).value;
    setState(() => _dragOffset = 0);

    if (rec != null) {
      ref.read(savedRecommendationsProvider.notifier).save(rec);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Saved "${rec.title}" to your list'),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          backgroundColor: Colors.white.withValues(alpha: 0.12),
          duration: const Duration(seconds: 2),
        ),
      );
    }
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
                        ? GestureDetector(
                            onHorizontalDragUpdate: (details) {
                              setState(() {
                                _dragOffset += details.delta.dx;
                              });
                            },
                            onHorizontalDragEnd: (details) {
                              if (_dragOffset < -_swipeThreshold) {
                                _onSwipeLeft();
                              } else if (_dragOffset > _swipeThreshold) {
                                _onSwipeRight();
                              } else {
                                setState(() {
                                  _dragOffset = 0;
                                });
                              }
                            },
                            child: AnimatedContainer(
                              duration: _dragOffset == 0
                                  ? const Duration(milliseconds: 300)
                                  : Duration.zero,
                              curve: Curves.easeOut,
                              transform: Matrix4.translationValues(
                                _dragOffset * 0.4,
                                0,
                                0,
                              )..rotateZ(_dragOffset * 0.0003),
                              child: RecommendationCard(recommendation: data),
                            ),
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
                          const CircularProgressIndicator(color: Colors.white54),
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
                        'Couldn\'t fetch a pick right now.',
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
