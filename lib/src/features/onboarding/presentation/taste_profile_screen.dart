import 'dart:ui' as dart_ui;
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';

class TasteProfileTabNotifier extends Notifier<String> {
  @override
  String build() => 'You';
  
  void setTab(String tab) => state = tab;
}

final tasteProfileTabProvider = NotifierProvider<TasteProfileTabNotifier, String>(TasteProfileTabNotifier.new);

class TasteProfileScreen extends ConsumerWidget {
  const TasteProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedTab = ref.watch(tasteProfileTabProvider);
    final activeRec = ref.watch(homeRecommendationProvider);

    // Extract selected chips from onboarding controller messages
    final onboardingState = ref.watch(onboardingControllerProvider);
    final messages = onboardingState.messages;
    final lastChipsMessage = messages.reversed.firstWhere(
      (m) => m.chips != null,
      orElse: () => ChatMessage(chips: [], isUser: false),
    );
    final chips = lastChipsMessage.chips ?? [];
    final tabsList = ['You', ...chips];

    // If selectedTab is not in tabsList (e.g. state reset or out of bounds), default to 'You'
    final activeTab = tabsList.contains(selectedTab) ? selectedTab : 'You';

    return Scaffold(
      backgroundColor: const Color(0xFF101114),
      body: Stack(
        children: [
          // ── Background ────────────────────────────
          Positioned.fill(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 600),
              child: activeRec != null && activeRec.posterUrl != null
                  ? Transform.scale(
                      scale: 1.2,
                      child: ImageFiltered(
                        key: ValueKey(activeRec.posterUrl),
                        imageFilter: dart_ui.ImageFilter.blur(
                          sigmaX: 80,
                          sigmaY: 80,
                          tileMode: TileMode.mirror,
                        ),
                        child: Image(
                          image: activeRec.posterUrl!.startsWith('assets/')
                              ? AssetImage(activeRec.posterUrl!)
                              : NetworkImage(activeRec.posterUrl!) as ImageProvider,
                          fit: BoxFit.cover,
                        ),
                      ),
                    )
                  : Container(
                      key: const ValueKey('empty'),
                      color: const Color(0xFF101114),
                    ),
            ),
          ),
          Positioned.fill(
            child: Container(color: Colors.white.withValues(alpha: 0.15)),
          ),
          
          SafeArea(
            bottom: false,
            child: Column(
              children: [
                const SizedBox(height: 24),
                TasteProfileTabBar(
                  selected: activeTab,
                  onSelected: (tab) => ref.read(tasteProfileTabProvider.notifier).setTab(tab),
                  tabs: tabsList,
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: TasteProfileCard(
                      key: ValueKey(activeTab),
                      tab: activeTab,
                      tabsList: tabsList,
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

// ── Tab Bar ──────────────────────────────────────────────────────────

class TasteProfileTabBar extends StatefulWidget {
  const TasteProfileTabBar({
    super.key,
    required this.selected,
    required this.onSelected,
    required this.tabs,
  });

  final String selected;
  final ValueChanged<String> onSelected;
  final List<String> tabs;

  @override
  State<TasteProfileTabBar> createState() => _TasteProfileTabBarState();
}

class _TasteProfileTabBarState extends State<TasteProfileTabBar> {
  final ScrollController _scrollController = ScrollController();
  bool _isScrolled = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      final isScrolled = _scrollController.offset > 5;
      if (isScrolled != _isScrolled) {
        setState(() => _isScrolled = isScrolled);
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: 41,
      padding: const EdgeInsets.only(left: 8),
      child: ShaderMask(
        shaderCallback: (Rect bounds) {
          return LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [
              _isScrolled ? Colors.transparent : Colors.black,
              Colors.black,
              Colors.black,
              Colors.transparent,
            ],
            stops: const [0.0, 0.15, 0.85, 1.0],
          ).createShader(bounds);
        },
        blendMode: BlendMode.dstIn,
        child: SingleChildScrollView(
          controller: _scrollController,
          scrollDirection: Axis.horizontal,
          physics: const BouncingScrollPhysics(),
          child: Row(
            children: [
              for (var i = 0; i < widget.tabs.length; i++) ...[
                _buildTab(widget.tabs[i], widget.tabs[i] == widget.selected),
              ],
              const SizedBox(width: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTab(String label, bool isSelected) {
    return GestureDetector(
      onTap: () => widget.onSelected(label),
      child: Container(
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
                  fontSize: 18,
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
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                    height: 1.2,
                    shadows: [
                      Shadow(
                        offset: const Offset(0, 4),
                        blurRadius: 14,
                        color: const Color(0xFF000000).withValues(alpha: 0.25),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}

// ── Card ─────────────────────────────────────────────────────────────

class TasteProfileCard extends ConsumerStatefulWidget {
  const TasteProfileCard({
    required this.tab,
    required this.tabsList,
    super.key,
  });
  
  final String tab;
  final List<String> tabsList;

  @override
  ConsumerState<TasteProfileCard> createState() => _TasteProfileCardState();
}

class _TasteProfileCardState extends ConsumerState<TasteProfileCard> {
  final _maskScrollController = ScrollController();
  final _topScrollController = ScrollController();
  final _chatController = TextEditingController();
  final _chatFocusNode = FocusNode();
  late final List<String> _messages;

  @override
  void initState() {
    super.initState();
    final tabName = widget.tab.toLowerCase();
    if (tabName == 'anime') {
      _messages = ["I usually love mecha and psychological thrillers. Stories that make me question reality, like Evangelion or Serial Experiments Lain."];
    } else if (tabName == 'movies') {
      _messages = ["I'm a big fan of indie dramas and sci-fi films with great cinematography."];
    } else if (tabName == 'manga') {
      _messages = ["I read a lot of slice-of-life and dark fantasy. Anything with incredibly detailed art."];
    } else if (tabName == 'visual novel' || tabName == 'visual novels') {
      _messages = ["I enjoy deep, branching narratives with multiple endings. Sci-fi and mystery are my favorites."];
    } else if (tabName == 'books') {
      _messages = ["I mostly read historical fiction and high fantasy epics."];
    } else if (tabName == 'games') {
      _messages = ["I love open world RPGs and narrative driven action-adventure games."];
    } else if (tabName == 'you') {
      _messages = [
        "I'm a 24 year old creative living in the city. I'm usually drawn to stories about self-discovery, beautifully animated worlds, or anything that just feels really atmospheric and grounded. I love finding hidden gems."
      ];
    } else {
      _messages = ["I love finding stories that have a unique atmosphere and memorable characters."];
    }

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
    _chatController.dispose();
    _chatFocusNode.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _chatController.text.trim();
    if (text.isNotEmpty) {
      setState(() {
        _messages.add(text);
      });
      _chatController.clear();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_topScrollController.hasClients) {
          _topScrollController.animateTo(
            _topScrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  Widget _buildFadedContent(Widget child) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final height = constraints.maxHeight;
        double bottomStopStart = 0.8;
        double bottomStopEnd = 0.95;
        double topStopStart = 0.0;
        double topStopEnd = 0.05;

        if (height > 0 && !height.isInfinite) {
          final double bottomFadeEnd = height - 70;
          final double bottomFadeStart = bottomFadeEnd - 100;
          bottomStopStart = (bottomFadeStart / height).clamp(0.0, 1.0);
          bottomStopEnd = (bottomFadeEnd / height).clamp(0.0, 1.0);

          final double topFadeStart = 15;
          final double topFadeEnd = 29;
          topStopStart = (topFadeStart / height).clamp(0.0, 1.0);
          topStopEnd = (topFadeEnd / height).clamp(0.0, 1.0);
        }

        return ShaderMask(
          shaderCallback: (Rect bounds) {
            return LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: const [
                Colors.transparent,
                Colors.white,
                Colors.white,
                Colors.transparent,
              ],
              stops: [topStopStart, topStopEnd, bottomStopStart, bottomStopEnd],
            ).createShader(bounds);
          },
          blendMode: BlendMode.dstIn,
          child: child,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final bool isLastTab = widget.tab == widget.tabsList.last;

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(64)),
      child: LayoutBuilder(
        builder: (context, constraints) {
          return Stack(
            children: [
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
                      ],
                    ).createShader(bounds);
                  },
                  blendMode: BlendMode.srcOut,
                  child: Container(
                    color: Colors.transparent,
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: _buildFadedContent(
                            _CardLayout(
                              isKnockoutLayer: true,
                              scrollController: _maskScrollController,
                              messages: _messages,
                              tab: widget.tab,
                              onTellMeMore: () {
                                final currentIndex = widget.tabsList.indexOf(widget.tab);
                                if (currentIndex >= 0 && currentIndex < widget.tabsList.length - 1) {
                                  ref.read(tasteProfileTabProvider.notifier).setTab(widget.tabsList[currentIndex + 1]);
                                }
                              },
                              onLater: () => context.go('/home'),
                              isLastTab: isLastTab,
                            ),
                          ),
                        ),
                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: _PromptBar(
                            isKnockoutLayer: true,
                            chatController: _chatController,
                            chatFocusNode: _chatFocusNode,
                            onSend: () {},
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // ── Layer 2: Normal visible elements (overlay + real pills) ───
              Positioned.fill(
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: _buildFadedContent(
                        _CardLayout(
                          isKnockoutLayer: false,
                          scrollController: _topScrollController,
                          messages: _messages,
                          tab: widget.tab,
                          onTellMeMore: () {
                            final currentIndex = widget.tabsList.indexOf(widget.tab);
                            if (currentIndex >= 0 && currentIndex < widget.tabsList.length - 1) {
                              ref.read(tasteProfileTabProvider.notifier).setTab(widget.tabsList[currentIndex + 1]);
                            }
                          },
                          onLater: () => context.go('/home'),
                          isLastTab: isLastTab,
                        ),
                      ),
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: _PromptBar(
                        isKnockoutLayer: false,
                        chatController: _chatController,
                        chatFocusNode: _chatFocusNode,
                        onSend: _sendMessage,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Card Layout — used for both knockout and visible layers
// ═══════════════════════════════════════════════════════════════════════
class _CardLayout extends StatelessWidget {
  const _CardLayout({
    required this.isKnockoutLayer,
    required this.scrollController,
    required this.messages,
    required this.tab,
    required this.onTellMeMore,
    required this.onLater,
    required this.isLastTab,
  });

  final bool isKnockoutLayer;
  final ScrollController scrollController;
  final List<String> messages;
  final String tab;
  final VoidCallback onTellMeMore;
  final VoidCallback onLater;
  final bool isLastTab;

  @override
  Widget build(BuildContext context) {
    final String heroText;
    final List<String> paragraphs;
    final String systemReply1;
    final String systemReply2;

    final String tabName = tab.toLowerCase();

    if (tabName == 'you') {
      heroText = 'Now, tell me about\nyou';
      paragraphs = [
        "I would love to know who you are.",
        "The things that stay with you. The stories you love. The ones you didn't. The ones you couldn't stop thinking about.",
        "Tell me what moves you. What bores you. What you're always looking for.",
        "What stage of life you're in. How life's been treating you lately. There's no right answer.",
        "Just tell me whatever comes to mind.",
        "The more I get to know you, the better I'll get at finding things you'll genuinely connect with.",
      ];
      systemReply1 = "I think I've got a good sense of who you are now.";
      systemReply2 = "I can start finding your first pick, or you can tell me a bit more about the specific things you like to improve what I recommend.";
    } else {
      heroText = 'Tell me about your\ntaste in $tab';
      paragraphs = [
        "The $tabName you love. The ones you recommend to everyone. The ones that broke your heart.",
        "The $tabName you couldn't stop thinking about. The ones you never understood the hype around. The ones that just didn't click.",
        "The characters you connected with. The stories that stayed with you.",
        "Tell me what keeps you coming back.",
      ];
      systemReply1 = "I think I've got a good sense of your taste in $tab now.";
      systemReply2 = isLastTab
          ? "We've covered everything! I'm ready to find your first pick."
          : "I can start finding your first pick, or you can tell me a bit more about the specific things you like to improve what I recommend.";
    }

    return SingleChildScrollView(
      controller: scrollController,
      physics: isKnockoutLayer
          ? const NeverScrollableScrollPhysics(parent: BouncingScrollPhysics())
          : const BouncingScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 180),
      child: SafeArea(
        top: true,
        bottom: false,
        left: false,
        right: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 29),

            // ── Coda Avatar ──────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: isKnockoutLayer
                  ? Container(
                      width: 45,
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

            const SizedBox(height: 16),

            // ── Hero Text ────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.only(left: 24, right: 24),
                child: isKnockoutLayer
                    ? _buildHeroText(Colors.black, heroText)
                    : Opacity(
                        opacity: 0,
                        child: _buildHeroText(Colors.white, heroText),
                      ),
              ),
            const SizedBox(height: 28),

            // ── Body Paragraphs ──────────────────────────────────────
            ...paragraphs.map(
              (paragraph) => Padding(
                padding: const EdgeInsets.only(left: 24, right: 24, bottom: 20),
                child: isKnockoutLayer
                    ? _buildBodyText(paragraph, Colors.black)
                    : Opacity(
                        opacity: 0, // background is brightened globally
                        child: _buildBodyText(paragraph, Colors.white),
                      ),
              ),
            ),

            // ── First User Chat Message (Mock) ───────────────────────
            if (messages.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 48, right: 24, bottom: 20),
                child: Align(
                  alignment: Alignment.centerRight,
                  child: _buildChatBubble(messages.first),
                ),
              ),

            // ── System Follow-up ─────────────────────────────────────
            if (messages.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.only(left: 24, right: 24, bottom: 20),
                child: isKnockoutLayer
                    ? _buildBodyText(systemReply1, Colors.black)
                    : Opacity(
                        opacity: 0,
                        child: _buildBodyText(systemReply1, Colors.white),
                      ),
              ),
              Padding(
                padding: const EdgeInsets.only(left: 24, right: 24, bottom: 32),
                child: isKnockoutLayer
                    ? _buildBodyText(systemReply2, Colors.black)
                    : Opacity(
                        opacity: 0,
                        child: _buildBodyText(systemReply2, Colors.white),
                      ),
              ),
              
              // ── Action Buttons ───────────────────────────────────────
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: isLastTab
                    ? _buildActionButton(
                        "See my first pick",
                        onTap: isKnockoutLayer ? null : onLater,
                        showArrow: true,
                      )
                    : Row(
                        children: [
                          Expanded(
                            flex: 6,
                            child: _buildActionButton(
                              "Tell me more",
                              onTap: isKnockoutLayer ? null : onTellMeMore,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            flex: 4,
                            child: _buildActionButton(
                              "Later",
                              onTap: isKnockoutLayer ? null : onLater,
                            ),
                          ),
                        ],
                      ),
              ),

              // ── Additional User Chat Messages ───────────────────────
              if (messages.length > 1) ...[
                const SizedBox(height: 24),
                for (int i = 1; i < messages.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(left: 48, right: 24, bottom: 20),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: _buildChatBubble(messages[i]),
                    ),
                  ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildActionButton(String text, {VoidCallback? onTap, bool showArrow = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 50,
        padding: const EdgeInsets.only(left: 20, right: 20),
        decoration: BoxDecoration(
          color: isKnockoutLayer ? Colors.black : Colors.transparent,
          borderRadius: BorderRadius.circular(25),
        ),
        alignment: Alignment.centerLeft,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            isKnockoutLayer
                ? Opacity(
                    opacity: 0,
                    child: Text(
                      text,
                      style: GoogleFonts.inter(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  )
                : Text(
                    text,
                    style: GoogleFonts.inter(
                      color: Colors.black.withValues(alpha: 0.7),
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
            if (showArrow)
              isKnockoutLayer
                  ? Opacity(
                      opacity: 0,
                      child: const Icon(
                        Icons.arrow_forward,
                        size: 20,
                      ),
                    )
                  : Icon(
                      Icons.arrow_forward,
                      color: Colors.black.withValues(alpha: 0.7),
                      size: 20,
                    ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroText(Color color, String text) {
    return Text(
      text,
      style: GoogleFonts.inter(
        color: color,
        fontSize: 30,
        fontWeight: FontWeight.w900,
        height: 1.2,
        letterSpacing: 1.5,
      ),
    );
  }

  Widget _buildBodyText(String text, Color color) {
    return Text(
      text,
      style: GoogleFonts.inter(
        color: color,
        fontSize: 18,
        fontWeight: FontWeight.w700, // Bold
        height: 1.5,
      ),
    );
  }

  Widget _buildChatBubble(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: BoxDecoration(
        color: isKnockoutLayer ? Colors.black : Colors.transparent,
        borderRadius: BorderRadius.circular(20),
      ),
      child: isKnockoutLayer
          ? Opacity(
              opacity: 0,
              child: Text(
                text,
                style: GoogleFonts.inter(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  height: 1.4,
                ),
              ),
            )
          : Text(
              text,
              style: GoogleFonts.inter(
                color: Colors.black.withValues(alpha: 0.7),
                fontSize: 18,
                fontWeight: FontWeight.w700,
                height: 1.4,
              ),
            ),
    );
  }
}

class _PromptBar extends StatelessWidget {
  const _PromptBar({
    required this.isKnockoutLayer,
    required this.chatController,
    required this.chatFocusNode,
    required this.onSend,
  });

  final bool isKnockoutLayer;
  final TextEditingController chatController;
  final FocusNode chatFocusNode;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final isKeyboardOpen = View.of(context).viewInsets.bottom > 0;
    final safeBottom = MediaQuery.of(context).padding.bottom;
    
    final bottomPadding = isKeyboardOpen
        ? 16.0
        : safeBottom + 16.0;

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        bottom: bottomPadding,
        top: 8,
      ),
      child: Container(
        height: 51,
        decoration: BoxDecoration(
          color: isKnockoutLayer ? Colors.black : Colors.transparent,
          borderRadius: BorderRadius.circular(50),
        ),
        child: Opacity(
          opacity: isKnockoutLayer ? 0.0 : 1.0,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            alignment: Alignment.centerLeft,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: isKnockoutLayer ? null : chatController,
                    focusNode: isKnockoutLayer ? null : chatFocusNode,
                    enabled: !isKnockoutLayer,
                    style: GoogleFonts.inter(
                      color: Colors.black.withValues(alpha: 0.8),
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                    decoration: InputDecoration(
                      hintText: "Let's Talk",
                      hintStyle: GoogleFonts.inter(
                        color: Colors.black.withValues(alpha: 0.7),
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: EdgeInsets.zero,
                    ),
                    onSubmitted: (_) => onSend(),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: onSend,
                  child: Icon(
                    PhosphorIconsFill.paperPlaneTilt,
                    color: Colors.black.withValues(alpha: 0.7),
                    size: 20,
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
