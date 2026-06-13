import 'dart:ui' as dart_ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';

enum MemoriesTab { identity, tastes, guardrails, history }

class MemoriesScreen extends ConsumerStatefulWidget {
  const MemoriesScreen({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  ConsumerState<MemoriesScreen> createState() => _MemoriesScreenState();
}

class _MemoriesScreenState extends ConsumerState<MemoriesScreen> {
  late MemoriesTab _selectedTab;
  final _maskScrollController = ScrollController();
  final _topScrollController = ScrollController();

  // Inputs
  final _identityController = TextEditingController();
  final _tasteController = TextEditingController();
  final _guardrailsController = TextEditingController();
  final _historyController = TextEditingController();

  final _identityFocusNode = FocusNode();
  final _tasteFocusNode = FocusNode();
  final _guardrailsFocusNode = FocusNode();
  final _historyFocusNode = FocusNode();

  String _selectedCategoryKey = 'anime';
  String _selectedHistoryType = 'seen';

  static const _categories = [
    (key: 'anime', label: 'Anime'),
    (key: 'movies', label: 'Movies'),
    (key: 'tv_shows', label: 'TV Shows'),
    (key: 'visual_novels', label: 'Visual Novels'),
    (key: 'manga', label: 'Manga'),
    (key: 'books', label: 'Books'),
    (key: 'games', label: 'Games'),
    (key: 'youtube', label: 'YouTube'),
    (key: 'music', label: 'Music'),
  ];

  @override
  void initState() {
    super.initState();
    _selectedTab = MemoriesTab.values[widget.initialTab.clamp(0, MemoriesTab.values.length - 1)];

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
    _identityController.dispose();
    _tasteController.dispose();
    _guardrailsController.dispose();
    _historyController.dispose();
    _identityFocusNode.dispose();
    _tasteFocusNode.dispose();
    _guardrailsFocusNode.dispose();
    _historyFocusNode.dispose();
    super.dispose();
  }

  void _changeTab(MemoriesTab tab) {
    setState(() {
      _selectedTab = tab;
    });
    // Reset scroll positions
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_topScrollController.hasClients) _topScrollController.jumpTo(0);
      if (_maskScrollController.hasClients) _maskScrollController.jumpTo(0);
    });
  }

  @override
  Widget build(BuildContext context) {
    final activeRec = ref.watch(homeRecommendationProvider).value;
    final memory = ref.watch(livingMemoryProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      resizeToAvoidBottomInset: true,
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
                  memory: memory,
                ),
              ),
            ),
          ),

          // ── Layer 2: Normal visible elements ──────────────────────
          Positioned.fill(
            child: _buildScrollableBody(
              isKnockoutLayer: false,
              scrollController: _topScrollController,
              memory: memory,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScrollableBody({
    required bool isKnockoutLayer,
    required ScrollController scrollController,
    required LivingMemory memory,
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
                          'Memories',
                          style: GoogleFonts.inter(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: Colors.black,
                          ),
                        )
                      : Opacity(
                          opacity: 0,
                          child: Text(
                            'Memories',
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
          // Tab Bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              physics: isKnockoutLayer ? const NeverScrollableScrollPhysics() : const BouncingScrollPhysics(),
              child: Row(
                children: [
                  _buildTabButton(MemoriesTab.identity, 'Identity', isKnockoutLayer),
                  _buildTabButton(MemoriesTab.tastes, 'Tastes', isKnockoutLayer),
                  _buildTabButton(MemoriesTab.guardrails, 'Guardrails', isKnockoutLayer),
                  _buildTabButton(MemoriesTab.history, 'History', isKnockoutLayer),
                  const SizedBox(width: 32),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          // Tab Content
          Expanded(
            child: _buildTabContent(isKnockoutLayer, scrollController, memory),
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(MemoriesTab tab, String label, bool isKnockoutLayer) {
    final isSelected = _selectedTab == tab;

    if (isKnockoutLayer) {
      return GestureDetector(
        onTap: () => _changeTab(tab),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 16,
              fontWeight: FontWeight.w900,
              color: Colors.transparent, // Completely transparent in knockout layer (no cutout)
            ),
          ),
        ),
      );
    }

    return GestureDetector(
      onTap: () => _changeTab(tab),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: isSelected
            ? ShapeDecoration(
                color: Colors.black.withValues(alpha: 0.20),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(54.95),
                ),
              )
            : null,
        child: isSelected
            ? Text(
                label,
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.5,
                  height: 1.2,
                ),
              )
            : Opacity(
                opacity: 0.30,
                child: Text(
                  label,
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                    height: 1.2,
                  ),
                ),
              ),
      ),
    );
  }

  Widget _buildTabContent(bool isKnockoutLayer, ScrollController scrollController, LivingMemory memory) {
    switch (_selectedTab) {
      case MemoriesTab.identity:
        return _buildIdentityTab(isKnockoutLayer, scrollController, memory);
      case MemoriesTab.tastes:
        return _buildTastesTab(isKnockoutLayer, scrollController, memory);
      case MemoriesTab.guardrails:
        return _buildGuardrailsTab(isKnockoutLayer, scrollController, memory);
      case MemoriesTab.history:
        return _buildHistoryTab(isKnockoutLayer, scrollController, memory);
    }
  }

  // ── Tab 0: Identity ──────────────────────────────────────────────
  Widget _buildIdentityTab(bool isKnockoutLayer, ScrollController scrollController, LivingMemory memory) {
    return ListView(
      controller: scrollController,
      physics: isKnockoutLayer ? const NeverScrollableScrollPhysics() : const BouncingScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 64),
      children: [
        _buildAddBar(
          isKnockoutLayer: isKnockoutLayer,
          controller: _identityController,
          focusNode: _identityFocusNode,
          hintText: 'Add an identity trait...',
          onAdd: _addIdentityTrait,
        ),
        const SizedBox(height: 24),
        if (memory.globalIdentity.isEmpty)
          _buildEmptyMessage(isKnockoutLayer, 'No identity traits saved yet.')
        else
          ...memory.globalIdentity.asMap().entries.map((entry) {
            final idx = entry.key;
            final trait = entry.value;
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (idx > 0) const SizedBox(height: 48) else const SizedBox(height: 8),
                _buildMemoryRow(
                  isKnockoutLayer,
                  trait,
                  onDelete: () => _deleteIdentityTrait(trait),
                ),
              ],
            );
          }),
      ],
    );
  }

  Future<void> _addIdentityTrait() async {
    final text = _identityController.text.trim();
    if (text.isNotEmpty) {
      final memory = ref.read(livingMemoryProvider);
      final newIdentity = List<String>.from(memory.globalIdentity)..add(text);
      final updatedMemory = LivingMemory(
        globalIdentity: newIdentity,
        categoryProfiles: memory.categoryProfiles,
        recentContext: memory.recentContext,
        guardrails: memory.guardrails,
        seen: memory.seen,
        notForMe: memory.notForMe,
        watchlist: memory.watchlist,
      );
      await ref.read(livingMemoryProvider.notifier).seedMemory(updatedMemory);
      _identityController.clear();
      _identityFocusNode.unfocus();
    }
  }

  Future<void> _deleteIdentityTrait(String trait) async {
    final memory = ref.read(livingMemoryProvider);
    final newIdentity = List<String>.from(memory.globalIdentity)..remove(trait);
    final updatedMemory = LivingMemory(
      globalIdentity: newIdentity,
      categoryProfiles: memory.categoryProfiles,
      recentContext: memory.recentContext,
      guardrails: memory.guardrails,
      seen: memory.seen,
      notForMe: memory.notForMe,
      watchlist: memory.watchlist,
    );
    await ref.read(livingMemoryProvider.notifier).seedMemory(updatedMemory);
  }

  // ── Tab 1: Tastes ────────────────────────────────────────────────
  Widget _buildTastesTab(bool isKnockoutLayer, ScrollController scrollController, LivingMemory memory) {
    final hasAnyTastes = memory.categoryProfiles.values.any((list) => list.isNotEmpty);

    return ListView(
      controller: scrollController,
      physics: isKnockoutLayer ? const NeverScrollableScrollPhysics() : const BouncingScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 64),
      children: [
        _buildAddBar(
          isKnockoutLayer: isKnockoutLayer,
          controller: _tasteController,
          focusNode: _tasteFocusNode,
          hintText: 'Add a media taste...',
          onAdd: _addTaste,
          prefixDropdown: isKnockoutLayer
              ? const SizedBox(width: 80, height: 32)
              : DropdownButton<String>(
                  value: _selectedCategoryKey,
                  dropdownColor: const Color(0xFF16181C),
                  underline: const SizedBox(),
                  icon: const Icon(Icons.arrow_drop_down, color: Colors.black87),
                  style: GoogleFonts.inter(
                    color: Colors.black87,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                  items: _categories.map((cat) {
                    return DropdownMenuItem<String>(
                      value: cat.key,
                      child: Text(cat.label),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) {
                      setState(() => _selectedCategoryKey = val);
                    }
                  },
                ),
        ),
        const SizedBox(height: 24),
        if (!hasAnyTastes)
          _buildEmptyMessage(isKnockoutLayer, 'No tastes defined yet.')
        else
          ..._categories.asMap().entries.expand((entry) {
            final catIdx = entry.key;
            final cat = entry.value;
            final tastes = memory.categoryProfiles[cat.key] ?? [];
            if (tastes.isEmpty) return const <Widget>[];

            return [
              const SizedBox(height: 24),
              _buildCategoryHeader(isKnockoutLayer, cat.label),
              ...tastes.asMap().entries.map((tasteEntry) {
                final idx = tasteEntry.key;
                final taste = tasteEntry.value;
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (idx > 0) const SizedBox(height: 48) else const SizedBox(height: 16),
                    _buildMemoryRow(
                      isKnockoutLayer,
                      taste,
                      onDelete: () => _deleteTaste(cat.key, taste),
                    ),
                  ],
                );
              }),
            ];
          }),
      ],
    );
  }

  Future<void> _addTaste() async {
    final text = _tasteController.text.trim();
    if (text.isNotEmpty) {
      final memory = ref.read(livingMemoryProvider);
      final profiles = Map<String, List<String>>.from(memory.categoryProfiles);
      final list = List<String>.from(profiles[_selectedCategoryKey] ?? [])..add(text);
      profiles[_selectedCategoryKey] = list;
      final updatedMemory = LivingMemory(
        globalIdentity: memory.globalIdentity,
        categoryProfiles: profiles,
        recentContext: memory.recentContext,
        guardrails: memory.guardrails,
        seen: memory.seen,
        notForMe: memory.notForMe,
        watchlist: memory.watchlist,
      );
      await ref.read(livingMemoryProvider.notifier).seedMemory(updatedMemory);
      _tasteController.clear();
      _tasteFocusNode.unfocus();
    }
  }

  Future<void> _deleteTaste(String categoryKey, String taste) async {
    final memory = ref.read(livingMemoryProvider);
    final profiles = Map<String, List<String>>.from(memory.categoryProfiles);
    final list = List<String>.from(profiles[categoryKey] ?? [])..remove(taste);
    profiles[categoryKey] = list;
    final updatedMemory = LivingMemory(
      globalIdentity: memory.globalIdentity,
      categoryProfiles: profiles,
      recentContext: memory.recentContext,
      guardrails: memory.guardrails,
      seen: memory.seen,
      notForMe: memory.notForMe,
      watchlist: memory.watchlist,
    );
    await ref.read(livingMemoryProvider.notifier).seedMemory(updatedMemory);
  }

  // ── Tab 2: Guardrails ────────────────────────────────────────────
  Widget _buildGuardrailsTab(bool isKnockoutLayer, ScrollController scrollController, LivingMemory memory) {
    return ListView(
      controller: scrollController,
      physics: isKnockoutLayer ? const NeverScrollableScrollPhysics() : const BouncingScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 64),
      children: [
        _buildAddBar(
          isKnockoutLayer: isKnockoutLayer,
          controller: _guardrailsController,
          focusNode: _guardrailsFocusNode,
          hintText: 'Add a content guardrail...',
          onAdd: _addGuardrail,
        ),
        const SizedBox(height: 24),
        if (memory.guardrails.isEmpty)
          _buildEmptyMessage(isKnockoutLayer, 'No guardrails set yet.')
        else
          ...memory.guardrails.asMap().entries.map((entry) {
            final idx = entry.key;
            final guardrail = entry.value;
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (idx > 0) const SizedBox(height: 48) else const SizedBox(height: 8),
                _buildMemoryRow(
                  isKnockoutLayer,
                  guardrail,
                  onDelete: () => _deleteGuardrail(guardrail),
                ),
              ],
            );
          }),
      ],
    );
  }

  Future<void> _addGuardrail() async {
    final text = _guardrailsController.text.trim();
    if (text.isNotEmpty) {
      final memory = ref.read(livingMemoryProvider);
      final newGuardrails = List<String>.from(memory.guardrails)..add(text);
      final updatedMemory = LivingMemory(
        globalIdentity: memory.globalIdentity,
        categoryProfiles: memory.categoryProfiles,
        recentContext: memory.recentContext,
        guardrails: newGuardrails,
        seen: memory.seen,
        notForMe: memory.notForMe,
        watchlist: memory.watchlist,
      );
      await ref.read(livingMemoryProvider.notifier).seedMemory(updatedMemory);
      _guardrailsController.clear();
      _guardrailsFocusNode.unfocus();
    }
  }

  Future<void> _deleteGuardrail(String guardrail) async {
    final memory = ref.read(livingMemoryProvider);
    final newGuardrails = List<String>.from(memory.guardrails)..remove(guardrail);
    final updatedMemory = LivingMemory(
      globalIdentity: memory.globalIdentity,
      categoryProfiles: memory.categoryProfiles,
      recentContext: memory.recentContext,
      guardrails: newGuardrails,
      seen: memory.seen,
      notForMe: memory.notForMe,
      watchlist: memory.watchlist,
    );
    await ref.read(livingMemoryProvider.notifier).seedMemory(updatedMemory);
  }

  // ── Tab 3: History ───────────────────────────────────────────────
  Widget _buildHistoryTab(bool isKnockoutLayer, ScrollController scrollController, LivingMemory memory) {
    final hasHistory = memory.seen.isNotEmpty || memory.notForMe.isNotEmpty;

    return ListView(
      controller: scrollController,
      physics: isKnockoutLayer ? const NeverScrollableScrollPhysics() : const BouncingScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 64),
      children: [
        _buildAddBar(
          isKnockoutLayer: isKnockoutLayer,
          controller: _historyController,
          focusNode: _historyFocusNode,
          hintText: 'Add history entry...',
          onAdd: _addHistory,
          prefixDropdown: isKnockoutLayer
              ? const SizedBox(width: 130, height: 32)
              : DropdownButton<String>(
                  value: _selectedHistoryType,
                  dropdownColor: const Color(0xFF16181C),
                  underline: const SizedBox(),
                  icon: const Icon(Icons.arrow_drop_down, color: Colors.black87),
                  style: GoogleFonts.inter(
                    color: Colors.black87,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                  items: const [
                    DropdownMenuItem(value: 'seen', child: Text('Seen')),
                    DropdownMenuItem(value: 'notForMe', child: Text('Not Interested')),
                  ],
                  onChanged: (val) {
                    if (val != null) {
                      setState(() => _selectedHistoryType = val);
                    }
                  },
                ),
        ),
        const SizedBox(height: 24),
        if (!hasHistory)
          _buildEmptyMessage(isKnockoutLayer, 'No history entries saved.')
        else ...[
          if (memory.seen.isNotEmpty) ...[
            _buildCategoryHeader(isKnockoutLayer, 'Seen / Experienced'),
            ...memory.seen.asMap().entries.map((entry) {
              final idx = entry.key;
              final title = entry.value;
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (idx > 0) const SizedBox(height: 48) else const SizedBox(height: 16),
                  _buildMemoryRow(
                    isKnockoutLayer,
                    title,
                    onDelete: () => _deleteSeenItem(title),
                  ),
                ],
              );
            }),
          ],
          if (memory.notForMe.isNotEmpty) ...[
            const SizedBox(height: 32),
            _buildCategoryHeader(isKnockoutLayer, 'Not Interested / Excluded'),
            ...memory.notForMe.asMap().entries.map((entry) {
              final idx = entry.key;
              final title = entry.value;
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (idx > 0) const SizedBox(height: 48) else const SizedBox(height: 16),
                  _buildMemoryRow(
                    isKnockoutLayer,
                    title,
                    onDelete: () => _deleteNotForMeItem(title),
                  ),
                ],
              );
            }),
          ],
        ],
      ],
    );
  }

  Future<void> _addHistory() async {
    final text = _historyController.text.trim();
    if (text.isNotEmpty) {
      final memory = ref.read(livingMemoryProvider);
      final updatedMemory = LivingMemory(
        globalIdentity: memory.globalIdentity,
        categoryProfiles: memory.categoryProfiles,
        recentContext: memory.recentContext,
        guardrails: memory.guardrails,
        seen: _selectedHistoryType == 'seen'
            ? (List<String>.from(memory.seen)..add(text))
            : memory.seen,
        notForMe: _selectedHistoryType == 'notForMe'
            ? (List<String>.from(memory.notForMe)..add(text))
            : memory.notForMe,
        watchlist: memory.watchlist,
      );
      await ref.read(livingMemoryProvider.notifier).seedMemory(updatedMemory);
      _historyController.clear();
      _historyFocusNode.unfocus();
    }
  }

  Future<void> _deleteSeenItem(String title) async {
    final memory = ref.read(livingMemoryProvider);
    final updatedMemory = LivingMemory(
      globalIdentity: memory.globalIdentity,
      categoryProfiles: memory.categoryProfiles,
      recentContext: memory.recentContext,
      guardrails: memory.guardrails,
      seen: List<String>.from(memory.seen)..remove(title),
      notForMe: memory.notForMe,
      watchlist: memory.watchlist,
    );
    await ref.read(livingMemoryProvider.notifier).seedMemory(updatedMemory);
  }

  Future<void> _deleteNotForMeItem(String title) async {
    final memory = ref.read(livingMemoryProvider);
    final updatedMemory = LivingMemory(
      globalIdentity: memory.globalIdentity,
      categoryProfiles: memory.categoryProfiles,
      recentContext: memory.recentContext,
      guardrails: memory.guardrails,
      seen: memory.seen,
      notForMe: List<String>.from(memory.notForMe)..remove(title),
      watchlist: memory.watchlist,
    );
    await ref.read(livingMemoryProvider.notifier).seedMemory(updatedMemory);
  }

  // ── Helper Widgets ───────────────────────────────────────────────
  Widget _buildEmptyMessage(bool isKnockoutLayer, String message) {
    return Padding(
      padding: const EdgeInsets.only(top: 48, left: 24, right: 24),
      child: Center(
        child: isKnockoutLayer
            ? Text(
                message,
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
                  message,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
      ),
    );
  }

  Widget _buildCategoryHeader(bool isKnockoutLayer, String title) {
    final textStyle = GoogleFonts.inter(
      fontSize: 14,
      fontWeight: FontWeight.w900,
      letterSpacing: 1.5,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: isKnockoutLayer
          ? Text(
              title.toUpperCase(),
              style: textStyle.copyWith(color: Colors.black),
            )
          : Opacity(
              opacity: 0,
              child: Text(
                title.toUpperCase(),
                style: textStyle,
              ),
            ),
    );
  }

  Widget _buildMemoryRow(
    bool isKnockoutLayer,
    String text, {
    VoidCallback? onDelete,
  }) {
    return Padding(
      padding: const EdgeInsets.only(left: 24, right: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: isKnockoutLayer
                ? Text(
                    text,
                    style: GoogleFonts.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: Colors.black,
                    ),
                  )
                : Opacity(
                    opacity: 0,
                    child: Text(
                      text,
                      style: GoogleFonts.inter(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
          ),
          const SizedBox(width: 24),
          if (onDelete != null)
            GestureDetector(
              onTap: isKnockoutLayer ? null : onDelete,
              behavior: HitTestBehavior.opaque,
              child: SizedBox(
                width: 40,
                height: 40,
                child: Center(
                  child: Icon(
                    Icons.delete_outline_rounded,
                    color: isKnockoutLayer ? Colors.transparent : Colors.white70,
                    size: 22,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildAddBar({
    required bool isKnockoutLayer,
    required TextEditingController controller,
    required FocusNode focusNode,
    required String hintText,
    required VoidCallback onAdd,
    Widget? prefixDropdown,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      child: Container(
        height: 51,
        decoration: BoxDecoration(
          color: isKnockoutLayer ? Colors.black : Colors.transparent,
          borderRadius: BorderRadius.circular(50),
          border: isKnockoutLayer ? Border.all(color: Colors.black, width: 1.5) : null,
        ),
        child: Opacity(
          opacity: isKnockoutLayer ? 0.0 : 1.0,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            alignment: Alignment.centerLeft,
            child: Row(
              children: [
                if (prefixDropdown != null) ...[
                  prefixDropdown,
                  const SizedBox(width: 8),
                  Container(
                    width: 1.5,
                    height: 24,
                    color: Colors.black.withOpacity(0.2),
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: TextField(
                    controller: isKnockoutLayer ? null : controller,
                    focusNode: isKnockoutLayer ? null : focusNode,
                    enabled: !isKnockoutLayer,
                    textAlignVertical: TextAlignVertical.center,
                    style: GoogleFonts.inter(
                      color: Colors.black.withValues(alpha: 0.8),
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                    decoration: InputDecoration(
                      hintText: hintText,
                      hintStyle: GoogleFonts.inter(
                        color: Colors.black.withValues(alpha: 0.6),
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: EdgeInsets.zero,
                    ),
                    onSubmitted: (_) => onAdd(),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: onAdd,
                  child: Icon(
                    Icons.add_circle_outline_rounded,
                    color: Colors.black.withValues(alpha: 0.7),
                    size: 24,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
