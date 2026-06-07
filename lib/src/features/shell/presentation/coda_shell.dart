import 'dart:ui';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/features/library/presentation/library_screen.dart';
import 'package:coda/src/features/library/presentation/widgets/library_tab_bar.dart';

class CodaShell extends ConsumerWidget {
  const CodaShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mediaQuery = MediaQuery.maybeOf(context);
    final isKeyboardOpen = mediaQuery != null && mediaQuery.viewInsets.bottom > 0;
    final bottomPadding = mediaQuery != null ? mediaQuery.padding.bottom + 16 : 16.0;

    final rec = ref.watch(homeRecommendationProvider).value;

    return Scaffold(
      backgroundColor: const Color(0xFF101114),
      body: Stack(
        children: [
          // ── Global Background ────────────────────────────
          Positioned.fill(
            child: Transform.scale(
              scale: 1.2,
              child: ImageFiltered(
                imageFilter: ImageFilter.blur(
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
          if (rec != null && rec.posterUrl != null && rec.posterUrl!.isNotEmpty && !rec.posterUrl!.startsWith('holder:'))
            Positioned.fill(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 600),
                child: Transform.scale(
                  scale: 1.2,
                  key: ValueKey(rec.posterUrl),
                  child: ImageFiltered(
                    imageFilter: ImageFilter.blur(
                      sigmaX: 80,
                      sigmaY: 80,
                      tileMode: TileMode.mirror,
                    ),
                    child: FallbackImage(
                      url: rec.posterUrl,
                      fit: BoxFit.cover,
                      width: double.infinity,
                      height: double.infinity,
                      errorWidget: const SizedBox.shrink(),
                    ),
                  ),
                ),
              ),
            ),
          Positioned.fill(
            child: Container(color: Colors.white.withValues(alpha: 0.15)),
          ),
          // ── Page content ─────────────────────────────────
          navigationShell,

          // ── Floating navbar ──────────────────────────────
          if (!isKeyboardOpen)
            Positioned(
              left: 0,
              right: 0,
              bottom: bottomPadding,
              child: Center(
                child: _FloatingNavBar(
                  currentIndex: navigationShell.currentIndex,
                  onTap: (index) {
                    if (index == 0) {
                      ref.read(libraryTabProvider.notifier).setTab(LibraryTab.lists);
                    }
                    navigationShell.goBranch(
                      index,
                      initialLocation: index == navigationShell.currentIndex,
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _FloatingNavBar extends StatelessWidget {
  const _FloatingNavBar({required this.currentIndex, required this.onTap});

  final int currentIndex;
  final ValueChanged<int> onTap;

  static final List<_NavItem> _items = [
    _NavItem(icon: PhosphorIcons.cards(PhosphorIconsStyle.fill), label: 'List'),
    _NavItem(
      icon: PhosphorIcons.houseSimple(PhosphorIconsStyle.fill),
      label: 'Home',
    ),
    _NavItem(
      icon: PhosphorIcons.sparkle(PhosphorIconsStyle.fill),
      label: 'Ask',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(50),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16), // Reduced blur
        child: Container(
          height: 51,
          padding: const EdgeInsets.symmetric(
            horizontal: 7,
          ), // Reduced by 1 point
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.03), // More transparent
            borderRadius: BorderRadius.circular(50),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.08),
              width: 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(_items.length, (index) {
              final item = _items[index];
              final isSelected = index == currentIndex;

              return GestureDetector(
                onTap: () => onTap(index),
                behavior: HitTestBehavior.opaque,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOut,
                  width: 59, // Reduced by 1 point
                  height: 51, // Increased by 1 point
                  child: Center(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      child: Icon(
                        item.icon,
                        key: ValueKey('${item.label}_$isSelected'),
                        size: 24, // Increased icon size
                        color: isSelected
                            ? Colors.white
                            : Colors.white.withValues(alpha: 0.25),
                        shadows: isSelected
                            ? [
                                const Shadow(
                                  color: Colors.white,
                                  blurRadius: 20,
                                ),
                              ]
                            : null,
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class _NavItem {
  const _NavItem({required this.icon, required this.label});

  final IconData icon;
  final String label;
}
