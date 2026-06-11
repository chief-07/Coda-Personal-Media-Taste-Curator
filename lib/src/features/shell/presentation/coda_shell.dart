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

class _CodaShellState extends ConsumerState<CodaShell> {
  StreamSubscription? _intentSub;
  bool _isAnalyzingSharedImage = false;

  @override
  void initState() {
    super.initState();
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
  void dispose() {
    _intentSub?.cancel();
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
