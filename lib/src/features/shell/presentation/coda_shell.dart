import 'dart:async';
import 'dart:convert';
import 'dart:ui';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

import 'package:coda/src/features/home/presentation/home_screen.dart';
import 'package:coda/src/features/library/presentation/library_screen.dart';
import 'package:coda/src/features/library/presentation/widgets/library_tab_bar.dart';
import 'package:coda/src/features/recommendation/application/audio_player_controller.dart';
import 'package:coda/src/core/providers/api_config.dart';

class CodaShell extends ConsumerStatefulWidget {
  const CodaShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<CodaShell> createState() => _CodaShellState();
}

class _CodaShellState extends ConsumerState<CodaShell> with TickerProviderStateMixin {
  StreamSubscription? _intentSub;
  bool _isAnalyzingSharedImage = false;
  
  late final AnimationController _branchAnimationController;
  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnimation;
  bool _isTransitioning = false;
  int? _targetIndex;

  int? _fromIndex;
  int? _toIndex;

  /// Persistent branch widget references – avoids depending on the removed
  /// StatefulNavigationShell.children getter (go_router ≥17).
  late final List<Widget> _branchWidgets;

  @override
  void initState() {
    super.initState();
    _branchAnimationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 250),
      value: 1.0,
    );
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3200),
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _pulseController,
        curve: Curves.easeInOutSine,
      ),
    );
    // Branch order mirrors router.dart: 0=Library, 1=Home
    // Ask (index 2) is pushed as a root route, not a shell branch
    _branchWidgets = const [
      LibraryScreen(),
      HomeScreen(),
    ];
    if (!kIsWeb) {
      // Listener for media sharing when app is in background or foreground
      _intentSub = ReceiveSharingIntent.instance.getMediaStream().listen((value) {
        if (value.isNotEmpty) {
          _handleSharedMedia(value);
        }
      }, onError: (err) {
        debugPrint("getMediaStream error: $err");
      });

      // Check for initial media if app is launched from cold start
      ReceiveSharingIntent.instance.getInitialMedia().then((value) {
        if (value.isNotEmpty) {
          _handleSharedMedia(value);
        }
      });
    }
  }

  @override
  void didUpdateWidget(covariant CodaShell oldWidget) {
    super.didUpdateWidget(oldWidget);
  }

  @override
  void dispose() {
    _intentSub?.cancel();
    _pulseController.dispose();
    _branchAnimationController.dispose();
    super.dispose();
  }

  void _handleSharedMedia(List<SharedMediaFile> media) async {
    final imagePath = media.first.path;
    setState(() {
      _isAnalyzingSharedImage = true;
    });

    try {
      final baseUrl = getApiBaseUrl();
      final targetUrl = '$baseUrl/api/detect/detect-media';

      final request = http.MultipartRequest('POST', Uri.parse(targetUrl));
      
      String cleanPath = imagePath;
      if (imagePath.startsWith('file://')) {
        try {
          cleanPath = Uri.parse(imagePath).toFilePath();
        } catch (_) {}
      }
      
      request.files.add(await http.MultipartFile.fromPath('image', cleanPath));

      final streamedResponse = await request.send().timeout(const Duration(seconds: 60));
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (mounted) {
          setState(() {
            _isAnalyzingSharedImage = false;
          });
          final itemsList = data['items'] ?? [];
          final itemsStr = itemsList.isNotEmpty ? jsonEncode(itemsList) : null;
          context.go(Uri(
            path: '/share-receive',
            queryParameters: {
              if (itemsStr != null) 'items': itemsStr,
              'title': data['title'] ?? '',
              'media_type': data['media_type'] ?? '',
              'tags': jsonEncode(data['tags'] ?? []),
              'description': data['description'] ?? '',
              'coda_blurb': data['coda_blurb'] ?? '',
              'poster_url': data['poster_url'] ?? '',
              'ost_url': data['ost_url'] ?? '',
            },
          ).toString());
        }
      } else {
        throw Exception('Detection failed with status: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error processing shared image: $e');
      if (mounted) {
        setState(() {
          _isAnalyzingSharedImage = false;
        });
        context.go('/share-receive?error=${Uri.encodeComponent(e.toString())}');
      }
    }
  }

  void _handleTap(int index) {
    // Ask Coda (index 2) is a pushed root route — use context.push
    if (index == 2) {
      context.push('/ask');
      return;
    }

    if (index == widget.navigationShell.currentIndex) return;

    if (index == 0) {
      ref.read(libraryTabProvider.notifier).setTab(LibraryTab.archive);
    }

    final fromIndex = widget.navigationShell.currentIndex;
    final toIndex = index;

    // Crossfade between Home (1) and Library (0)
    setState(() {
      _fromIndex = fromIndex;
      _toIndex = toIndex;
      _targetIndex = toIndex;
      _isTransitioning = true;
    });

    widget.navigationShell.goBranch(
      toIndex,
      initialLocation: toIndex == widget.navigationShell.currentIndex,
    );

    _branchAnimationController.duration = const Duration(milliseconds: 250);
    _branchAnimationController.forward(from: kIsWeb ? 0.6 : 0.3).then((_) {
      if (mounted) {
        setState(() {
          _isTransitioning = false;
          _targetIndex = null;
          _fromIndex = null;
          _toIndex = null;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final navigationShell = widget.navigationShell;
    
    // Keep audio player active and listening to home recommendation updates
    ref.watch(audioPlayerControllerProvider);

    final mediaQuery = MediaQuery.maybeOf(context);
    final isKeyboardOpen = mediaQuery != null && mediaQuery.viewInsets.bottom > 0;
    final bottomPadding = mediaQuery != null ? mediaQuery.padding.bottom + 16 : 16.0;

    final rec = ref.watch(homeRecommendationProvider).value;

    return Scaffold(
      backgroundColor: const Color(0xFF101114),
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          // ── Global Background ────────────────────────────
          Positioned.fill(
            child: RepaintBoundary(
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
          ),
          if (rec != null && rec.posterUrl != null && rec.posterUrl!.isNotEmpty && !rec.posterUrl!.startsWith('holder:'))
            Positioned.fill(
              child: RepaintBoundary(
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
            ),
          // ── Screen-Wide Ambient Glow Bloom & Breathing Pulse ──────────────────
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _pulseAnimation,
              builder: (context, _) {
                final double progress = _pulseAnimation.value;
                // Bloom scale: gently expands across the whole canvas
                final double scale = 1.0 + (progress * 0.22);
                // Luminous opacities designed to shine through the dark card's 75% mask
                final double bloomCoreOpacity = 0.12 + (progress * 0.48);
                final double bloomMidOpacity = 0.06 + (progress * 0.28);
                final double bloomEdgeOpacity = 0.02 + (progress * 0.14);
                final double washOpacity = 0.04 + (progress * 0.14);

                return Stack(
                  fit: StackFit.expand,
                  children: [
                    // Full-screen ambient wash
                    Container(
                      color: Colors.white.withValues(alpha: washOpacity),
                    ),
                    // Screen-spanning radial bloom
                    Transform.scale(
                      scale: scale,
                      alignment: const Alignment(0, -0.05),
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: RadialGradient(
                            center: const Alignment(0, -0.05),
                            radius: 1.35,
                            colors: [
                              Colors.white.withValues(alpha: bloomCoreOpacity),
                              Colors.white.withValues(alpha: bloomMidOpacity),
                              Colors.white.withValues(alpha: bloomEdgeOpacity),
                              Colors.transparent,
                            ],
                            stops: const [0.0, 0.40, 0.85, 1.0],
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          AnimatedBuilder(
            animation: _branchAnimationController,
            builder: (context, _) {
              final double t = _branchAnimationController.value;

              Widget finalWidget;

              if (_isTransitioning && _fromIndex != null && _toIndex != null) {
                // Crossfade between Home (1) and Library (0)
                  final Widget fromWidget = _branchWidgets[_fromIndex!];
                  final Widget toWidget = _branchWidgets[_toIndex!];

                  final double startFrom = kIsWeb ? 0.6 : 0.3;
                  final double crossFadeT = ((t - startFrom) / (1.0 - startFrom)).clamp(0.0, 1.0);

                  finalWidget = Stack(
                    children: [
                      Positioned.fill(
                        child: Opacity(
                          opacity: (1.0 - crossFadeT).clamp(0.0, 1.0),
                          child: fromWidget,
                        ),
                      ),
                      Positioned.fill(
                        child: Opacity(
                          opacity: crossFadeT,
                          child: toWidget,
                        ),
                      ),
                    ],
                  );
              } else {
                // Not transitioning — render the shell directly
                finalWidget = navigationShell;
              }

              return finalWidget;
            },
          ),

          // ── Floating navbar ──────────────────────────────
          if (!isKeyboardOpen)
            Positioned(
              left: 0,
              right: 0,
              bottom: bottomPadding,
              child: Center(
                child: FloatingNavBar(
                  currentIndex: _targetIndex ?? navigationShell.currentIndex,
                  onTap: _handleTap,
                ),
              ),
            ),

          // ── Loading overlay for shared intent ────────────
          if (_isAnalyzingSharedImage)
            Positioned.fill(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
                child: Container(
                  color: Colors.black.withValues(alpha: 0.7),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CircularProgressIndicator(
                          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                        const SizedBox(height: 24),
                        Text(
                          'Analyzing shared image...',
                          style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
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
    );
  }
}

class FloatingNavBar extends StatelessWidget {
  const FloatingNavBar({required this.currentIndex, required this.onTap, super.key});

  final int currentIndex;
  final ValueChanged<int> onTap;

  static final List<NavItem> _items = [
    NavItem(icon: PhosphorIcons.cards(PhosphorIconsStyle.fill), label: 'List'),
    NavItem(
      icon: PhosphorIcons.houseSimple(PhosphorIconsStyle.fill),
      label: 'Home',
    ),
    NavItem(
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

class NavItem {
  const NavItem({required this.icon, required this.label});

  final IconData icon;
  final String label;
}
