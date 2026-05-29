import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/features/library/presentation/widgets/library_tab_bar.dart';

class LibraryCard extends StatefulWidget {
  const LibraryCard({super.key, required this.tab});

  final LibraryTab tab;

  @override
  State<LibraryCard> createState() => _LibraryCardState();
}

class _LibraryCardState extends State<LibraryCard> {
  final _maskScrollController = ScrollController();
  final _topScrollController = ScrollController();

  bool _themeEnabled = true;
  bool _audioEnabled = true;
  bool _reduceAnimationsEnabled = false;

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
          return ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: SizedBox(
              width: double.infinity,
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
                        Container(color: Colors.transparent),
                        _CardLayout(
                          isKnockoutLayer: true,
                          scrollController: _maskScrollController,
                          themeValue: _themeEnabled,
                          audioValue: _audioEnabled,
                          reduceAnimationsValue: _reduceAnimationsEnabled,
                          currentTab: widget.tab,
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Layer 2: Normal Elements ────────────────────────────────
                _CardLayout(
                  isKnockoutLayer: false,
                  scrollController: _topScrollController,
                  themeValue: _themeEnabled,
                  audioValue: _audioEnabled,
                  reduceAnimationsValue: _reduceAnimationsEnabled,
                  currentTab: widget.tab,
                  onThemeChanged: (val) => setState(() => _themeEnabled = val),
                  onAudioChanged: (val) => setState(() => _audioEnabled = val),
                  onReduceAnimationsChanged: (val) => setState(() => _reduceAnimationsEnabled = val),
                ),
              ],
            ),
            ),
          );
        },
      ),
    );
  }
}

class _CardLayout extends StatelessWidget {
  const _CardLayout({
    required this.isKnockoutLayer,
    required this.scrollController,
    required this.themeValue,
    required this.audioValue,
    required this.reduceAnimationsValue,
    required this.currentTab,
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
  final ValueChanged<bool>? onThemeChanged;
  final ValueChanged<bool>? onAudioChanged;
  final ValueChanged<bool>? onReduceAnimationsChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
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
                : Opacity(
                    opacity: 0,
                    child: const SizedBox(width: 45, height: 45),
                  ),
          ),
          
          if (currentTab == LibraryTab.lists) ...[
            const SizedBox(height: 35),
            _buildListItemRow(
              'Serial Experiment Lain',
              ['13 eps', 'Sci-fi', 'Psychological'],
              'assets/lain.jpg',
            ),
            const SizedBox(height: 35),
            _buildListItemRow(
              'Interstellar',
              ['Movie', 'Sci-fi', 'Psychological'],
              'assets/interstellar.jpg',
            ),
            const SizedBox(height: 64),
          ],

          if (currentTab == LibraryTab.settings) ...[
            const SizedBox(height: 35),
            
            _buildSettingsRow('Theme', hasToggle: true, toggleValue: themeValue, onToggle: onThemeChanged),
            const SizedBox(height: 35),
            _buildSettingsRow('Privacy policy'),
            const SizedBox(height: 35),
            _buildSettingsRow('Memories'),
            const SizedBox(height: 35),
            _buildSettingsRow('Account'),
            const SizedBox(height: 35),
            _buildSettingsRow(
              'Reduce animations',
              hasToggle: true,
              toggleValue: reduceAnimationsValue,
              onToggle: onReduceAnimationsChanged,
            ),
            const SizedBox(height: 35),
            _buildSettingsRow('Audio', hasToggle: true, toggleValue: audioValue, onToggle: onAudioChanged),
            
            const SizedBox(height: 64),
          ],

          if (currentTab == LibraryTab.archive) ...[
            const SizedBox(height: 35),
            _buildArchiveRow('Serial Experiment Lain', 'Psychological trauma dressed as a teddy'),
            const SizedBox(height: 35),
            _buildArchiveRow('Interstellar', 'Love transcends time and space'),
            const SizedBox(height: 64),
          ],

          if (currentTab == LibraryTab.seen) ...[
            const SizedBox(height: 35),
            _buildSeenRow('The Matrix'),
            const SizedBox(height: 24),
            _buildSeenRow('Inception'),
            const SizedBox(height: 64),
          ],
        ],
      ),
    );
  }

  Widget _buildArchiveRow(String title, String subtitle) {
    return Padding(
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
  }

  Widget _buildSeenRow(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
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
    );
  }

  Widget _buildListItemRow(String title, List<String> tags, String imageAsset) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
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
              : Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade800,
                    borderRadius: BorderRadius.circular(8),
                    image: DecorationImage(
                      image: AssetImage(imageAsset),
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
          const SizedBox(width: 16),
          // Content
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                isKnockoutLayer
                    ? Text(
                        title,
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
                          style: GoogleFonts.inter(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: tags.map((tag) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _buildTagPill(tag),
                    )).toList(),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTagPill(String text) {
    if (isKnockoutLayer) {
      // Punch a partial hole for the tag background
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: ShapeDecoration(
          color: Colors.black.withValues(alpha: 0.55), // 55% knockout hole
          shape: const StadiumBorder(),
        ),
        child: Opacity(
          opacity: 0, // Text doesn't punch a hole
          child: Text(
            text,
            style: GoogleFonts.inter(
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      );
    }

    // Normal layer: Just draw the text over the hole
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: const ShapeDecoration(
        color: Colors.transparent, // Background is punched out
        shape: StadiumBorder(),
      ),
      child: Text(
        text,
        style: GoogleFonts.inter(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: Colors.black87, // Dark text over bright hole
        ),
      ),
    );
  }

  Widget _buildSettingsRow(
    String label, {
    bool hasToggle = false,
    bool toggleValue = false,
    ValueChanged<bool>? onToggle,
  }) {
    return Padding(
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
