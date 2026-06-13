import 'dart:ui' as dart_ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/features/library/presentation/widgets/library_tab_bar.dart';
import 'package:go_router/go_router.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:coda/src/core/utils/linked_scroll_controller.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/library/presentation/library_screen.dart';
import 'package:coda/src/features/session/application/archived_sessions_controller.dart';

class LibraryCard extends ConsumerStatefulWidget {
  const LibraryCard({super.key, required this.tab});

  final LibraryTab tab;

  @override
  ConsumerState<LibraryCard> createState() => _LibraryCardState();
}

class _LibraryCardState extends ConsumerState<LibraryCard> {
  final _maskScrollController = ScrollController();
  final _topScrollController = ScrollController();

  // Map to store LinkedScrollControllers for each item title
  final Map<String, LinkedScrollController> _horizontalControllers = {};

  bool _themeEnabled = true;
  bool _audioEnabled = true;
  bool _reduceAnimationsEnabled = false;

  LinkedScrollController _getHorizontalController(String title) {
    return _horizontalControllers.putIfAbsent(title, () => LinkedScrollController());
  }

  @override
  void initState() {
    super.initState();
    // Sync the knockout mask scroll to exactly match the top layer scroll
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
    for (final controller in _horizontalControllers.values) {
      controller.dispose();
    }
    _horizontalControllers.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(64),
      ), // Same radius as RecommendationCard
      child: LayoutBuilder(
        builder: (context, constraints) {
          return SizedBox(
            width: double.infinity,
            height: constraints.maxHeight,
            child: Stack(
              children: [
                // ── Layer 1: Knockout Mask ──────────────────────────────────
                Positioned.fill(
                  child: ShaderMask(
                    shaderCallback: (Rect bounds) {
                      return LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(
                            alpha: 0.75,
                          ), // Solid black at top
                          Colors.black.withValues(
                            alpha: 0.75,
                          ), // Stays solid for text
                          Colors.black.withValues(
                            alpha: 0.50,
                          ), // Fades to 50% transparent at bottom
                        ],
                        stops: const [0.0, 0.65, 1.0],
                      ).createShader(bounds);
                    },
                    blendMode: BlendMode.srcOut,
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: Container(color: Colors.black.withValues(alpha: 0.01)),
                        ),
                        Positioned.fill(
                          child: _CardLayout(
                            isKnockoutLayer: true,
                            scrollController: _maskScrollController,
                            themeValue: _themeEnabled,
                            audioValue: _audioEnabled,
                            reduceAnimationsValue: _reduceAnimationsEnabled,
                            currentTab: widget.tab,
                            horizontalControllerProvider: _getHorizontalController,
                          ),
                        ),
                        if (widget.tab == LibraryTab.lists)
                          Positioned(
                            bottom: 75.0,
                            right: 24.0,
                            child: Container(
                              width: 56,
                              height: 56,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.black, // Punches a solid cutout circle
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),

                // ── Layer 2: Normal Elements ────────────────────────────────
                Positioned.fill(
                  child: _CardLayout(
                    isKnockoutLayer: false,
                    scrollController: _topScrollController,
                    themeValue: _themeEnabled,
                    audioValue: _audioEnabled,
                    reduceAnimationsValue: _reduceAnimationsEnabled,
                    currentTab: widget.tab,
                    horizontalControllerProvider: _getHorizontalController,
                    onThemeChanged: (val) => setState(() => _themeEnabled = val),
                    onAudioChanged: (val) => setState(() => _audioEnabled = val),
                    onReduceAnimationsChanged: (val) => setState(() => _reduceAnimationsEnabled = val),
                  ),
                ),
                if (widget.tab == LibraryTab.lists)
                  Positioned(
                    bottom: 75.0,
                    right: 24.0,
                    child: GestureDetector(
                      onTap: () => showAddMediaDialog(context),
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        width: 56,
                        height: 56,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.transparent,
                        ),
                        child: Center(
                          child: Icon(
                            PhosphorIconsBold.plus,
                            color: Colors.black.withValues(alpha: 0.7), // Plus icon black with 70% opacity
                            size: 24,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CardLayout extends ConsumerWidget {
  const _CardLayout({
    required this.isKnockoutLayer,
    required this.scrollController,
    required this.themeValue,
    required this.audioValue,
    required this.reduceAnimationsValue,
    required this.currentTab,
    required this.horizontalControllerProvider,
    this.onThemeChanged,
    this.onAudioChanged,
    this.onReduceAnimationsChanged,
  });

  final bool isKnockoutLayer;
  final ScrollController scrollController;
  final bool themeValue;
  final bool audioValue;
  final bool reduceAnimationsValue;
  final LibraryTab currentTab;
  final LinkedScrollController Function(String title) horizontalControllerProvider;
  final ValueChanged<bool>? onThemeChanged;
  final ValueChanged<bool>? onAudioChanged;
  final ValueChanged<bool>? onReduceAnimationsChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final memory = ref.watch(livingMemoryProvider);
    return SingleChildScrollView(
      controller: scrollController,
      physics: isKnockoutLayer
          ? const NeverScrollableScrollPhysics()
          : const BouncingScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 110),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 24),
          // ── Coda Avatar ──────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: isKnockoutLayer
                ? Container(
                    width: 45, // Same circle as RecommendationCard
                    height: 45,
                    decoration: const BoxDecoration(
                      color: Colors.black,
                      shape: BoxShape.circle,
                    ),
                  )
                : Image.asset(
                    'assets/images/coda_logo.png',
                    width: 45,
                    height: 45,
                    fit: BoxFit.contain,
                  ),
          ),
          
          if (currentTab == LibraryTab.lists) ...[
            if (memory.watchlist.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 48, left: 24, right: 24),
                child: Center(
                  child: isKnockoutLayer
                      ? Text(
                          'Your watchlist is empty.',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.inter(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: Colors.black,
                          ),
                        )
                      : Opacity(
                          opacity: 0,
                          child: Text(
                            'Your watchlist is empty.',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.inter(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                ),
              )
            else ...[
              const SizedBox(height: 12),
              ...memory.watchlist.asMap().entries.map((entry) {
                final idx = entry.key;
                final item = entry.value;
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (idx > 0) const SizedBox(height: 48) else const SizedBox(height: 8),
                    _buildListItemRow(
                      item.title,
                      [item.mediaType, ...item.tags],
                      item.posterUrl,
                      horizontalControllerProvider(item.title),
                      onDelete: () async {
                        _showDeleteConfirmDialog(
                          context,
                          ref,
                          title: 'Delete "${item.title}"?',
                          message: 'Are you sure you want to remove this from your watchlist?',
                          onDelete: () async {
                            await ref.read(livingMemoryProvider.notifier).applyUpdates(
                              MemoryUpdates(watchlistRemoves: [item.title]),
                            );
                          },
                        );
                      },
                      onLongPress: () {
                        _showDeleteConfirmDialog(
                          context,
                          ref,
                          title: 'Delete "${item.title}"?',
                          message: 'Are you sure you want to remove this from your watchlist?',
                          onDelete: () async {
                            await ref.read(livingMemoryProvider.notifier).applyUpdates(
                              MemoryUpdates(watchlistRemoves: [item.title]),
                            );
                          },
                        );
                      },
                    ),
                  ],
                );
              }),
              const SizedBox(height: 64),
            ],
          ],

          if (currentTab == LibraryTab.settings) ...[
            const SizedBox(height: 48),
            _buildSettingsRow(
              'Account',
              onTap: () => context.push('/account'),
            ),
            const SizedBox(height: 48),
            _buildSettingsRow(
              'Coda Plus',
              onTap: () => context.push('/support-coda'),
            ),
            const SizedBox(height: 48),
            _buildSettingsRow(
              'Memories',
              onTap: () => context.push('/memories?tab=0'),
            ),
            const SizedBox(height: 48),
            _buildSettingsRow(
              'Manage Guardrails',
              onTap: () => context.push('/memories?tab=2'),
            ),
            const SizedBox(height: 48),
            _buildSettingsRow(
              'Audio',
              hasToggle: true,
              toggleValue: audioValue,
              onToggle: onAudioChanged,
            ),
            const SizedBox(height: 48),
            _buildSettingsRow('Privacy policy'),
            const SizedBox(height: 64),
          ],

          if (currentTab == LibraryTab.archive) ...[
            const SizedBox(height: 35),
            (() {
              final archivedSessions = ref.watch(archivedSessionsProvider);
              if (archivedSessions.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: isKnockoutLayer
                      ? Text(
                          'Your archive is empty.',
                          style: GoogleFonts.inter(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: Colors.black,
                          ),
                        )
                      : Opacity(
                          opacity: 0,
                          child: Text(
                            'Your archive is empty.',
                            style: GoogleFonts.inter(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                );
              }
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ...archivedSessions.asMap().entries.map((entry) {
                    final idx = entry.key;
                    final session = entry.value;
                    return Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (idx > 0) const SizedBox(height: 35),
                        _buildArchiveRow(
                          session.title,
                          session.oneLineSummary,
                          onTap: () {
                            context.push('/session-chat?id=${session.id}');
                          },
                          onLongPress: () {
                            _showDeleteConfirmDialog(
                              context,
                              ref,
                              title: 'Delete Session?',
                              message: 'Are you sure you want to delete this session? This will remove all chat logs and history associated with this recommendation.',
                              onDelete: () async {
                                await ref.read(archivedSessionsProvider.notifier).deleteSession(session.id);
                              },
                            );
                          },
                        ),
                      ],
                    );
                  }),
                ],
              );
            })(),
            const SizedBox(height: 64),
          ],

          if (currentTab == LibraryTab.seen) ...[
            const SizedBox(height: 48),
            if (memory.seen.isEmpty && memory.notForMe.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: isKnockoutLayer
                    ? Text(
                        'No seen or rejected items.',
                        style: GoogleFonts.inter(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: Colors.black,
                        ),
                      )
                    : Opacity(
                        opacity: 0,
                        child: Text(
                          'No seen or rejected items.',
                          style: GoogleFonts.inter(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
              )
            else ...[
              if (memory.seen.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                  child: isKnockoutLayer
                      ? Text(
                          'SEEN / WATCHED',
                          style: GoogleFonts.inter(
                            color: Colors.black,
                            fontSize: 14,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.2,
                          ),
                        )
                      : Opacity(
                          opacity: 0,
                          child: Text(
                            'SEEN / WATCHED',
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.2,
                            ),
                          ),
                        ),
                ),
                ...memory.seen.map((title) => _buildSeenRow(
                      title,
                      onDelete: () async {
                        _showDeleteConfirmDialog(
                          context,
                          ref,
                          title: 'Delete "$title"?',
                          message: 'Are you sure you want to remove this from your history?',
                          onDelete: () async {
                            final newSeen = List<String>.from(memory.seen)..remove(title);
                            final newGuardrails = List<String>.from(memory.guardrails)
                              ..remove('Already watched: $title');
                            final updates = LivingMemory(
                              globalIdentity: memory.globalIdentity,
                              categoryProfiles: memory.categoryProfiles,
                              recentContext: memory.recentContext,
                              guardrails: newGuardrails,
                              seen: newSeen,
                              notForMe: memory.notForMe,
                              watchlist: memory.watchlist,
                            );
                            await ref.read(livingMemoryProvider.notifier).seedMemory(updates);
                          },
                        );
                      },
                      onLongPress: () {
                        _showDeleteConfirmDialog(
                          context,
                          ref,
                          title: 'Delete "$title"?',
                          message: 'Are you sure you want to remove this from your history?',
                          onDelete: () async {
                            final newSeen = List<String>.from(memory.seen)..remove(title);
                            final newGuardrails = List<String>.from(memory.guardrails)
                              ..remove('Already watched: $title');
                            final updates = LivingMemory(
                              globalIdentity: memory.globalIdentity,
                              categoryProfiles: memory.categoryProfiles,
                              recentContext: memory.recentContext,
                              guardrails: newGuardrails,
                              seen: newSeen,
                              notForMe: memory.notForMe,
                              watchlist: memory.watchlist,
                            );
                            await ref.read(livingMemoryProvider.notifier).seedMemory(updates);
                          },
                        );
                      },
                    )),
              ],
              if (memory.notForMe.isNotEmpty) ...[
                const SizedBox(height: 24),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                  child: isKnockoutLayer
                      ? Text(
                          'REJECTED (NOT FOR ME)',
                          style: GoogleFonts.inter(
                            color: Colors.black,
                            fontSize: 14,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.2,
                          ),
                        )
                      : Opacity(
                          opacity: 0,
                          child: Text(
                            'REJECTED (NOT FOR ME)',
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.2,
                            ),
                          ),
                        ),
                ),
                ...memory.notForMe.map((title) => _buildSeenRow(
                      title,
                      onDelete: () async {
                        _showDeleteConfirmDialog(
                          context,
                          ref,
                          title: 'Delete "$title"?',
                          message: 'Are you sure you want to remove this from your history?',
                          onDelete: () async {
                            final newNotForMe = List<String>.from(memory.notForMe)..remove(title);
                            final newGuardrails = List<String>.from(memory.guardrails)
                              ..remove('Avoid: $title (rejected)');
                            final updates = LivingMemory(
                              globalIdentity: memory.globalIdentity,
                              categoryProfiles: memory.categoryProfiles,
                              recentContext: memory.recentContext,
                              guardrails: newGuardrails,
                              seen: memory.seen,
                              notForMe: newNotForMe,
                              watchlist: memory.watchlist,
                            );
                            await ref.read(livingMemoryProvider.notifier).seedMemory(updates);
                          },
                        );
                      },
                      onLongPress: () {
                        _showDeleteConfirmDialog(
                          context,
                          ref,
                          title: 'Delete "$title"?',
                          message: 'Are you sure you want to remove this from your history?',
                          onDelete: () async {
                            final newNotForMe = List<String>.from(memory.notForMe)..remove(title);
                            final newGuardrails = List<String>.from(memory.guardrails)
                              ..remove('Avoid: $title (rejected)');
                            final updates = LivingMemory(
                              globalIdentity: memory.globalIdentity,
                              categoryProfiles: memory.categoryProfiles,
                              recentContext: memory.recentContext,
                              guardrails: newGuardrails,
                              seen: memory.seen,
                              notForMe: newNotForMe,
                              watchlist: memory.watchlist,
                            );
                            await ref.read(livingMemoryProvider.notifier).seedMemory(updates);
                          },
                        );
                      },
                    )),
              ],
            ],
            const SizedBox(height: 64),
          ],
        ],
      ),
    );
  }

  Widget _buildArchiveRow(
    String title,
    String subtitle, {
    VoidCallback? onTap,
    VoidCallback? onLongPress,
  }) {
    final rowContent = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          isKnockoutLayer
              ? Row(
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.inter(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: Colors.black, // 100% knockout
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(
                      PhosphorIconsBold.caretRight,
                      color: Colors.black, // 100% knockout
                      size: 20,
                    ),
                  ],
                )
              : Opacity(
                  opacity: 0,
                  child: Row(
                    children: [
                      Text(
                        title,
                        style: GoogleFonts.inter(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Icon(
                        PhosphorIconsBold.caretRight,
                        size: 20,
                      ),
                    ],
                  ),
                ),
          const SizedBox(height: 8),
          isKnockoutLayer
              ? Text(
                  subtitle,
                  style: GoogleFonts.inter(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.black, // 100% knockout
                    letterSpacing: 0.2,
                  ),
                )
              : Opacity(
                  opacity: 0,
                  child: Text(
                    subtitle,
                    style: GoogleFonts.inter(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),
        ],
      ),
    );

    if (isKnockoutLayer || (onTap == null && onLongPress == null)) {
      return rowContent;
    }

    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      behavior: HitTestBehavior.opaque,
      child: rowContent,
    );
  }

  Widget _buildSeenRow(
    String title, {
    VoidCallback? onDelete,
    VoidCallback? onLongPress,
  }) {
    final rowContent = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: isKnockoutLayer
                ? Text(
                    title,
                    style: GoogleFonts.inter(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: Colors.black, // 100% knockout
                      letterSpacing: 0.5,
                    ),
                  )
                : Opacity(
                    opacity: 0,
                    child: Text(
                      title,
                      style: GoogleFonts.inter(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
          ),
          if (!isKnockoutLayer)
            IconButton(
              icon: const Icon(Icons.delete_outline_rounded, color: Colors.white70),
              onPressed: onDelete,
              splashRadius: 20,
            )
          else
            const SizedBox(width: 48, height: 48),
        ],
      ),
    );

    if (isKnockoutLayer || onLongPress == null) {
      return rowContent;
    }

    return GestureDetector(
      onLongPress: onLongPress,
      behavior: HitTestBehavior.opaque,
      child: rowContent,
    );
  }

  Widget _buildListItemRow(
    String title,
    List<String> tags,
    String imageAsset,
    ScrollController horizontalScroll, {
    VoidCallback? onDelete,
    VoidCallback? onLongPress,
  }) {
    final rowContent = Padding(
      padding: const EdgeInsets.only(left: 24, right: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Thumbnail
          isKnockoutLayer
              ? Opacity(
                  opacity: 0,
                  child: Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                )
              : ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: SizedBox(
                    width: 72,
                    height: 72,
                    child: FallbackImage(
                      url: imageAsset,
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
          const SizedBox(width: 16),
          // Content
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                isKnockoutLayer
                    ? Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: Colors.black, // 100% knockout
                          letterSpacing: 0.5,
                        ),
                      )
                    : Opacity(
                        opacity: 0,
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  controller: horizontalScroll,
                  scrollDirection: Axis.horizontal,
                  physics: const BouncingScrollPhysics(),
                  clipBehavior: Clip.hardEdge,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: tags.map((tag) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _buildTagPill(tag),
                    )).toList(),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 24),
          if (onDelete != null) ...[
            if (!isKnockoutLayer)
              IconButton(
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
                icon: const Icon(Icons.delete_outline_rounded, color: Colors.white70, size: 22),
                onPressed: onDelete,
                splashRadius: 20,
              )
            else
              const SizedBox(width: 24, height: 24),
          ],
        ],
      ),
    );

    if (isKnockoutLayer || onLongPress == null) {
      return rowContent;
    }

    return GestureDetector(
      onLongPress: onLongPress,
      behavior: HitTestBehavior.opaque,
      child: rowContent,
    );
  }

  Widget _buildTagPill(String text) {
    final textStyle = GoogleFonts.inter(
      fontSize: 13,
      fontWeight: FontWeight.w700,
    );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: ShapeDecoration(
        color: isKnockoutLayer
            ? Colors.black.withValues(alpha: 0.55) // 55% knockout hole
            : Colors.transparent, // Background is punched out
        shape: const StadiumBorder(),
      ),
      child: Text(
        text,
        style: textStyle.copyWith(
          color: isKnockoutLayer ? Colors.transparent : Colors.black87,
        ),
      ),
    );
  }

  void _showDeleteConfirmDialog(
    BuildContext context,
    WidgetRef ref, {
    required String title,
    required String message,
    required VoidCallback onDelete,
  }) {
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
                  title,
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  message,
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
                      onPressed: () {
                        Navigator.of(dialogCtx).pop();
                        onDelete();
                      },
                      child: Text(
                        'Delete',
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
                  'Reset Account?',
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
                      onPressed: () => Navigator.of(dialogCtx).pop(),
                      child: Text(
                        'Cancel',
                        style: GoogleFonts.inter(
                          color: Colors.white54,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFFF3B5C),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      ),
                      onPressed: () async {
                        Navigator.of(dialogCtx).pop();
                        await ref.read(livingMemoryProvider.notifier).clearMemory();
                        if (context.mounted) {
                          context.go('/onboarding');
                        }
                      },
                      child: Text(
                        'Reset Everything',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
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

  Widget _buildSettingsRow(
    String label, {
    bool hasToggle = false,
    bool toggleValue = false,
    ValueChanged<bool>? onToggle,
    VoidCallback? onTap,
  }) {
    final rowContent = Padding(
      padding: const EdgeInsets.only(left: 24, right: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          isKnockoutLayer
              ? Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    color: Colors.black, // Punches hole
                    letterSpacing: 0.5,
                  ),
                )
              : Opacity(
                  opacity: 0,
                  child: Text(
                    label,
                    style: GoogleFonts.inter(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
          if (hasToggle)
            Padding(
              padding: const EdgeInsets.only(right: 15), // Pushing it left
              child: _KnockoutToggle(
                value: toggleValue,
                onChanged: onToggle,
                isKnockout: isKnockoutLayer,
              ),
            )
          else
            const SizedBox(width: 58, height: 32),
        ],
      ),
    );

    if (hasToggle || isKnockoutLayer || onTap == null) {
      return rowContent;
    }

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: rowContent,
    );
  }
}

class _KnockoutToggle extends StatelessWidget {
  const _KnockoutToggle({
    required this.value,
    required this.onChanged,
    required this.isKnockout,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;
  final bool isKnockout;

  @override
  Widget build(BuildContext context) {
    final toggleUi = Container(
      width: 58,
      height: 32,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: isKnockout ? Border.all(color: Colors.black, width: 2) : null,
      ),
      child: AnimatedAlign(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        alignment: value ? Alignment.centerRight : Alignment.centerLeft,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: isKnockout
              ? Container(
                  width: 28,
                  height: 24,
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(12),
                  ),
                )
              : const SizedBox(width: 28, height: 24),
        ),
      ),
    );

    if (isKnockout) {
      return toggleUi;
    } else {
      return GestureDetector(
        onTap: () {
          if (onChanged != null) onChanged!(!value);
        },
        behavior: HitTestBehavior.opaque,
        child: Opacity(
          opacity: 0,
          child: toggleUi,
        ),
      );
    }
  }
}
