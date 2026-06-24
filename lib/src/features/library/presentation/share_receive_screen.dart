import 'dart:convert';
import 'dart:ui' as dart_ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:coda/src/features/library/presentation/widgets/library_tab_bar.dart';
import 'package:coda/src/features/library/presentation/library_screen.dart';
import 'package:coda/src/features/recommendation/data/recommendation_service.dart';
import 'package:coda/src/features/session/data/living_memory_provider.dart';
import 'package:coda/src/features/home/data/recommendation_provider.dart';
import 'package:coda/src/features/home/presentation/home_screen.dart';

class DetectedMediaItem {
  final String title;
  final String mediaType;
  final List<String> tags;
  final String description;
  final String codaBlurb;
  final String posterUrl;
  final String ostUrl;

  DetectedMediaItem({
    required this.title,
    required this.mediaType,
    required this.tags,
    required this.description,
    required this.codaBlurb,
    required this.posterUrl,
    required this.ostUrl,
  });
}

class ShareReceiveScreen extends ConsumerStatefulWidget {
  final String title;
  final String mediaType;
  final String tagsStr;
  final String description;
  final String codaBlurb;
  final String posterUrl;
  final String ostUrl;
  final String? error;
  final String? itemsStr;

  const ShareReceiveScreen({
    super.key,
    required this.title,
    required this.mediaType,
    required this.tagsStr,
    required this.description,
    required this.codaBlurb,
    required this.posterUrl,
    required this.ostUrl,
    this.error,
    this.itemsStr,
  });

  @override
  ConsumerState<ShareReceiveScreen> createState() => _ShareReceiveScreenState();
}

class _ShareReceiveScreenState extends ConsumerState<ShareReceiveScreen> {
  final List<DetectedMediaItem> _items = [];
  final Map<int, bool> _selectedMap = {};
  bool _isInitialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_isInitialized) {
      _initializeItems();
      _isInitialized = true;
    }
  }

  void _initializeItems() {
    _items.clear();
    _selectedMap.clear();

    if (widget.itemsStr != null && widget.itemsStr!.isNotEmpty) {
      try {
        final List<dynamic> decodedList = jsonDecode(widget.itemsStr!);
        for (final item in decodedList) {
          final title = item['title'] ?? '';
          if (title.isEmpty) continue;
          
          final tagsRaw = item['tags'];
          List<String> tags = [];
          if (tagsRaw is List) {
            tags = List<String>.from(tagsRaw);
          } else if (tagsRaw is String && tagsRaw.isNotEmpty) {
            try {
              tags = List<String>.from(jsonDecode(tagsRaw));
            } catch (_) {}
          }

          _items.add(DetectedMediaItem(
            title: title,
            mediaType: item['media_type'] ?? '',
            tags: tags,
            description: item['description'] ?? '',
            codaBlurb: item['coda_blurb'] ?? '',
            posterUrl: item['poster_url'] ?? '',
            ostUrl: item['ost_url'] ?? '',
          ));
        }
      } catch (e) {
        debugPrint('Error decoding itemsStr: $e');
      }
    }

    // Fallback if no items successfully decoded
    if (_items.isEmpty && widget.title.isNotEmpty) {
      final tags = widget.tagsStr.isNotEmpty
          ? List<String>.from(jsonDecode(widget.tagsStr))
          : <String>[];
      _items.add(DetectedMediaItem(
        title: widget.title,
        mediaType: widget.mediaType,
        tags: tags,
        description: widget.description,
        codaBlurb: widget.codaBlurb,
        posterUrl: widget.posterUrl,
        ostUrl: widget.ostUrl,
      ));
    }

    // Select all by default
    for (int i = 0; i < _items.length; i++) {
      _selectedMap[i] = true;
    }
  }

  int _selectedCount() {
    return _selectedMap.values.where((v) => v).length;
  }

  Future<void> _promoteToHome(BuildContext context, DetectedMediaItem item) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(child: CircularProgressIndicator(color: Colors.white)),
    );

    final recommendation = await ref.read(recommendationServiceProvider).promoteMedia(
      title: item.title,
      memory: ref.read(livingMemoryProvider),
    );

    if (mounted) {
      Navigator.of(context, rootNavigator: true).pop(); // Close loading dialog
    }

    if (recommendation != null) {
      await ref.read(homeRecommendationProvider.notifier).setActivePick(recommendation);
      ref.read(selectedMediaTypeProvider.notifier).select(recommendation.mediaType);
      if (mounted) {
        context.go('/home');
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not promote ${item.title}.'),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    }
  }

  Future<void> _showVibeCheckOverlay(BuildContext context, DetectedMediaItem item) async {
    showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.8),
      builder: (context) {
        return Center(
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.0, end: 1.0),
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutBack,
            builder: (context, val, child) {
              return Transform.scale(
                scale: val,
                child: Opacity(
                  opacity: val.clamp(0.0, 1.0),
                  child: child,
                ),
              );
            },
            child: Material(
              color: Colors.transparent,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(28),
                child: BackdropFilter(
                  filter: dart_ui.ImageFilter.blur(sigmaX: 30, sigmaY: 30),
                  child: Container(
                    width: MediaQuery.of(context).size.width * 0.85,
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white30, width: 1.5),
                          ),
                          child: ClipOval(
                            child: Image.asset(
                              'assets/images/coda_logo.png',
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          'Checking the vibes...',
                          style: GoogleFonts.inter(
                            color: Colors.white70,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 16),
                        FutureBuilder<VibeCheckResult>(
                          future: ref.read(recommendationServiceProvider).vibeCheck(
                            title: item.title,
                            memory: ref.read(livingMemoryProvider),
                          ),
                          builder: (context, snapshot) {
                            if (snapshot.connectionState == ConnectionState.waiting) {
                              return const Padding(
                                padding: EdgeInsets.symmetric(vertical: 20),
                                child: CircularProgressIndicator(color: Colors.white),
                              );
                            }
                            if (snapshot.hasError || !snapshot.hasData) {
                              return Text(
                                "I couldn't check this one right now.",
                                style: GoogleFonts.inter(color: Colors.white, fontSize: 16),
                              );
                            }
                            final result = snapshot.data!;
                            return Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  result.isMatch == true
                                      ? "IT'S A MATCH!"
                                      : result.isMatch == false
                                          ? "MAYBE NOT"
                                          : "UNKNOWN",
                                  style: GoogleFonts.inter(
                                    color: result.isMatch == true ? Colors.greenAccent : (result.isMatch == false ? Colors.orangeAccent : Colors.white),
                                    fontSize: 18,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 1.0,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  '"${result.convictionStatement}"',
                                  textAlign: TextAlign.center,
                                  style: GoogleFonts.inter(
                                    color: Colors.white,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    fontStyle: FontStyle.italic,
                                    height: 1.4,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                        const SizedBox(height: 24),
                        ElevatedButton(
                          onPressed: () => Navigator.of(context).pop(),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.white.withValues(alpha: 0.1),
                            foregroundColor: Colors.white,
                            elevation: 0,
                            minimumSize: const Size(double.infinity, 48),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
                            ),
                          ),
                          child: Text(
                            'Got it',
                            style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;

    // Use poster from the first item as background (or fallback if empty)
    final firstPoster = _items.isNotEmpty ? _items.first.posterUrl : '';

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0C),
      body: Stack(
        children: [
          // 1. Full-screen blurred poster background
          Positioned(
            top: 0, left: 0,
            width: screenWidth, height: screenHeight,
            child: firstPoster.isNotEmpty && !firstPoster.startsWith('holder:')
                ? Transform.scale(
                    scale: 1.2,
                    child: ImageFiltered(
                      imageFilter: dart_ui.ImageFilter.blur(
                        sigmaX: 80, sigmaY: 80,
                        tileMode: dart_ui.TileMode.mirror,
                      ),
                      child: FallbackImage(
                        url: firstPoster,
                        fit: BoxFit.cover,
                        errorWidget: const SizedBox.shrink(),
                      ),
                    ),
                  )
                : Container(color: const Color(0xFF101114)),
          ),

          // 2. Dark overlay
          Positioned.fill(
            child: Container(color: Colors.black.withValues(alpha: 0.45)),
          ),

          // 3. Scrollable card container
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 550),
                child: widget.error != null && widget.error!.isNotEmpty
                    ? _buildErrorCard()
                    : _buildSuccessCard(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Error card ───────────────────────────────────────────────────────────
  Widget _buildErrorCard() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: dart_ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: Colors.white.withValues(alpha: 0.12), width: 1.0),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(PhosphorIconsBold.warningCircle, color: Color(0xFFFF3B5C), size: 64),
              const SizedBox(height: 20),
              Text(
                'Import Failed',
                style: GoogleFonts.inter(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 12),
              Text(
                widget.error ?? 'Unknown error occurred.',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(color: Colors.white70, fontSize: 15, height: 1.4),
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white10,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                ),
                onPressed: () => context.go('/home'),
                child: Text('Close', style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ─── Success checklist card ────────────────────────────────────────────────
  Widget _buildSuccessCard() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Top Header with Coda badge ───────────────────────────────────────
        ClipRRect(
          borderRadius: BorderRadius.circular(28),
          child: BackdropFilter(
            filter: dart_ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: Colors.white.withValues(alpha: 0.12), width: 1.0),
              ),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.25),
                        width: 1.5,
                      ),
                    ),
                    child: ClipOval(
                      child: Image.asset(
                        'assets/images/coda_logo.png',
                        width: 36,
                        height: 36,
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _items.length > 1
                              ? 'Coda found ${_items.length} items'
                              : 'Coda found 1 item',
                          style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Select the ones you want to add to your watchlist',
                          style: GoogleFonts.inter(
                            color: Colors.white54,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),

        // ── List of detected item cards ──────────────────────────────────────
        ...List.generate(_items.length, (index) {
          final item = _items[index];
          final isSelected = _selectedMap[index] ?? false;

          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: BackdropFilter(
                filter: dart_ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: isSelected 
                        ? Colors.white.withValues(alpha: 0.08)
                        : Colors.white.withValues(alpha: 0.03),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: isSelected 
                          ? Colors.white.withValues(alpha: 0.18)
                          : Colors.white.withValues(alpha: 0.06),
                      width: 1.0,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header row: Checkbox + Poster + Title / Info
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Custom premium checkbox
                          Padding(
                            padding: const EdgeInsets.only(top: 4, right: 14),
                            child: GestureDetector(
                              onTap: () {
                                setState(() {
                                  _selectedMap[index] = !isSelected;
                                });
                              },
                              child: Container(
                                width: 24,
                                height: 24,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: isSelected ? Colors.white : Colors.transparent,
                                  border: Border.all(
                                    color: isSelected ? Colors.white : Colors.white38,
                                    width: 2.0,
                                  ),
                                ),
                                child: isSelected
                                    ? const Icon(
                                        Icons.check,
                                        color: Colors.black,
                                        size: 15,
                                      )
                                    : null,
                              ),
                            ),
                          ),

                          // Poster thumbnail
                          GestureDetector(
                            onTap: () => _promoteToHome(context, item),
                            child: item.posterUrl.isNotEmpty && !item.posterUrl.startsWith('holder:')
                                ? ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: SizedBox(
                                      width: 64,
                                      height: 88,
                                      child: FallbackImage(url: item.posterUrl, fit: BoxFit.cover),
                                    ),
                                  )
                                : Container(
                                    width: 64,
                                    height: 88,
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(alpha: 0.04),
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                                    ),
                                    child: const Center(
                                      child: Icon(PhosphorIconsBold.imageSquare, color: Colors.white24, size: 22),
                                    ),
                                  ),
                          ),
                          const SizedBox(width: 14),

                          // Title + media type pill + tags
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item.title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: GoogleFonts.inter(
                                    color: isSelected ? Colors.white : Colors.white70,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                    height: 1.2,
                                    decoration: isSelected ? null : TextDecoration.lineThrough,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    if (item.mediaType.isNotEmpty)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                        decoration: ShapeDecoration(
                                          color: Colors.white.withValues(alpha: 0.12),
                                          shape: const StadiumBorder(),
                                        ),
                                        child: Text(
                                          item.mediaType.toUpperCase(),
                                          style: GoogleFonts.inter(
                                            color: Colors.white,
                                            fontSize: 9,
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),

                      // Expandable/details section shown only when selected
                      if (isSelected) ...[
                        // Coda blurb
                        if (item.codaBlurb.isNotEmpty) ...[
                          const SizedBox(height: 14),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.03),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                            ),
                            child: Text(
                              '"${item.codaBlurb}"',
                              style: GoogleFonts.inter(
                                color: Colors.white,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                fontStyle: FontStyle.italic,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],

                        // Synopsis
                        if (item.description.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Text(
                            item.description,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.inter(
                              color: Colors.white38,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              height: 1.4,
                            ),
                          ),
                        ],
                        
                        // "Is this for me?" Button
                        const SizedBox(height: 14),
                        Align(
                          alignment: Alignment.centerRight,
                          child: GestureDetector(
                            onTap: () {
                              _showVibeCheckOverlay(context, item);
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              decoration: ShapeDecoration(
                                color: Colors.white.withValues(alpha: 0.1),
                                shape: const StadiumBorder(),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(PhosphorIconsBold.magicWand, size: 14, color: Colors.white),
                                  const SizedBox(width: 6),
                                  Text(
                                    'Is this for me?',
                                    style: GoogleFonts.inter(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          );
        }),

        const SizedBox(height: 16),

        // ── Action Buttons card ──────────────────────────────────────────────
        ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: BackdropFilter(
            filter: dart_ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1), width: 1.0),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextButton(
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.white54,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: () => context.go('/home'),
                      child: Text(
                        'Cancel',
                        style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: Colors.black,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: () async {
                        final selectedItems = <WatchlistItem>[];
                        for (int i = 0; i < _items.length; i++) {
                          if (_selectedMap[i] == true) {
                            final item = _items[i];
                            selectedItems.add(WatchlistItem(
                              title: item.title,
                              mediaType: item.mediaType,
                              tags: item.tags,
                              posterUrl: item.posterUrl,
                              ostUrl: item.ostUrl,
                              description: item.description,
                              codaBlurb: item.codaBlurb,
                              addedAt: DateTime.now(),
                            ));
                          }
                        }
                        
                        if (selectedItems.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                'Please select at least one item to import.',
                                style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                              ),
                              backgroundColor: const Color(0xFFFF3B5C),
                            ),
                          );
                          return;
                        }

                        await ref.read(livingMemoryProvider.notifier).applyUpdates(
                          MemoryUpdates(watchlistAppends: selectedItems),
                        );
                        if (mounted) {
                          ref.read(libraryTabProvider.notifier).setTab(LibraryTab.lists);
                          context.go('/library');
                        }
                      },
                      child: Text(
                        _selectedCount() > 1
                            ? 'Watchlist Selected (${_selectedCount()})'
                            : 'Watchlist It',
                        style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
