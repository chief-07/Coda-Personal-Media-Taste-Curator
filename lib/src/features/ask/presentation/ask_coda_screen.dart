import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/recommendation/data/recommendation_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

// ═══════════════════════════════════════════════════════════════════════
// Message model
// ═══════════════════════════════════════════════════════════════════════
class _AskChatMessage {
  final String text;
  final bool isUser;
  /// If non-null, this Coda message came with a completed recommendation
  final Recommendation? recommendation;

  _AskChatMessage({
    required this.text,
    required this.isUser,
    this.recommendation,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Static intro recommendation used for the layout skeleton
// ═══════════════════════════════════════════════════════════════════════
const _askRecommendation = Recommendation(
  id: 'ask-coda',
  title: 'Ask Coda',
  mediaType: MediaType.movie,
  codaBlurb: 'Tell me what you are looking for\nI\'ll find the one.',
  codaNote: '',
  description: '',
  genres: [],
  tags: [],
  fitSignals: [],
  posterGradient: [Color(0xFF0F1A1C), Color(0xFF1E353B), Color(0xFF4C7D8A)],
  releaseYear: '2026',
  pitch: [
    "Tell me what you're looking for. Your favorites, Something you can't stop thinking about.",
    "Something you wish you could experience again for the first time.",
    "Tell me how your day went\nTell me what you're feeling\nOr what you want to feel.\nExcited. Heartbroken. Curious. Lost. Comforted. Challenged. Anything.",
    "Just talk to me. I'll find the one",
  ],
);

// ═══════════════════════════════════════════════════════════════════════
// Screen
// ═══════════════════════════════════════════════════════════════════════
class AskCodaScreen extends ConsumerStatefulWidget {
  const AskCodaScreen({super.key});

  @override
  ConsumerState<AskCodaScreen> createState() => _AskCodaScreenState();
}

class _AskCodaScreenState extends ConsumerState<AskCodaScreen> {
  final _maskScrollController = ScrollController();
  final _topScrollController = ScrollController();
  final _chatController = TextEditingController();
  final _chatFocusNode = FocusNode();

  final List<_AskChatMessage> _messages = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
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

  void _scrollToBottom() {
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

  Future<void> _sendMessage() async {
    final text = _chatController.text.trim();
    if (text.isEmpty || _isLoading) return;

    setState(() {
      _messages.add(_AskChatMessage(text: text, isUser: true));
      _isLoading = true;
    });
    _chatController.clear();
    _chatFocusNode.unfocus();
    _scrollToBottom();

    // Build chat history from previous messages (exclude the one just added)
    final chatHistory = _messages
        .sublist(0, _messages.length - 1)
        .map((m) => {'isUser': m.isUser, 'text': m.text})
        .toList();

    try {
      final memory = ref.read(livingMemoryProvider);
      final response = await RecommendationService().sendAskChatMessage(
        memory: memory,
        chatHistory: chatHistory,
        userMessage: text,
      );

      if (!mounted) return;

      final status = response['status'] as String? ?? 'chatting';
      final message = response['message'] as String? ?? '';
      Recommendation? recommendation;

      if (status == 'success' && response['recommendation'] != null) {
        final recData = response['recommendation'] as Map<String, dynamic>;
        try {
          // Build a RecommendationResult from backend data and convert to domain
          final result = RecommendationResult.fromJson(recData);
          recommendation = result.toDomain();
        } catch (e) {
          debugPrint('Failed to parse recommendation from Ask Coda: $e');
        }
      }

      setState(() {
        _messages.add(_AskChatMessage(
          text: message,
          isUser: false,
          recommendation: recommendation,
        ));
        _isLoading = false;
      });
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _messages.add(_AskChatMessage(
          text: "Hmm, I'm having trouble connecting right now. Let's try again in a bit.",
          isUser: false,
        ));
        _isLoading = false;
      });
      _scrollToBottom();
    }
  }

  /// Called when user taps "See the Pick" — sets the recommendation as active
  /// for its media type and navigates to home.
  Future<void> _seeThePick(Recommendation rec) async {
    // Override the active pick for this media type
    await ref.read(homeRecommendationProvider.notifier).setActivePick(rec);
    // Switch the selected tab to match this recommendation's media type
    ref.read(selectedMediaTypeProvider.notifier).select(rec.mediaType);
    if (mounted) {
      context.go('/home');
    }
  }

  Widget _buildFadedContent(Widget child) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final double height = constraints.maxHeight;

        double stopStart = 0.0;
        double stopEnd = 1.0;

        if (height > 0 && !height.isInfinite) {
          final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
          final isKeyboardOpen = keyboardHeight > 0;
          final safeBottom = MediaQuery.of(context).padding.bottom;

          final bottomPadding = isKeyboardOpen
              ? 16.0
              : safeBottom + 83.0;

          final double promptBarTop = height - bottomPadding - 51.0;
          final double fadeEnd = promptBarTop - 8.0;
          final double fadeStart = fadeEnd - 100.0;

          stopStart = (fadeStart / height).clamp(0.0, 1.0);
          stopEnd = (fadeEnd / height).clamp(0.0, 1.0);
        }

        return ShaderMask(
          shaderCallback: (Rect bounds) {
            return LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: const [
                Colors.white,
                Colors.white,
                Colors.transparent,
                Colors.transparent,
              ],
              stops: [0.0, stopStart, stopEnd, 1.0],
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
    const rec = _askRecommendation;

    return PopScope<Object?>(
      canPop: !_chatFocusNode.hasFocus,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (_chatFocusNode.hasFocus) {
          _chatFocusNode.unfocus();
        }
      },
      child: Scaffold(
        backgroundColor: Colors.transparent,
        resizeToAvoidBottomInset: false,
        body: Stack(
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
                  color: Colors.black.withValues(alpha: 0.01),
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: _buildFadedContent(
                          _PitchLayout(
                            recommendation: rec,
                            isKnockoutLayer: true,
                            scrollController: _maskScrollController,
                            messages: _messages,
                            isLoading: _isLoading,
                            onSeeThePick: (_) {},
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
                      _PitchLayout(
                        recommendation: rec,
                        isKnockoutLayer: false,
                        scrollController: _topScrollController,
                        messages: _messages,
                        isLoading: _isLoading,
                        onSeeThePick: _seeThePick,
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
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Pitch Layout — used for both knockout and visible layers
// ═══════════════════════════════════════════════════════════════════════
class _PitchLayout extends StatelessWidget {
  const _PitchLayout({
    required this.recommendation,
    required this.isKnockoutLayer,
    required this.scrollController,
    required this.messages,
    required this.isLoading,
    required this.onSeeThePick,
  });

  final Recommendation recommendation;
  final bool isKnockoutLayer;
  final ScrollController scrollController;
  final List<_AskChatMessage> messages;
  final bool isLoading;
  final void Function(Recommendation rec) onSeeThePick;

  @override
  Widget build(BuildContext context) {
    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final isKeyboardOpen = keyboardHeight > 0;
    final safeBottom = MediaQuery.of(context).padding.bottom;
    final bottomPadding = isKeyboardOpen
        ? 83.0
        : safeBottom + 150.0;

    return SingleChildScrollView(
      controller: scrollController,
      physics: isKnockoutLayer
          ? const NeverScrollableScrollPhysics(parent: BouncingScrollPhysics())
          : const BouncingScrollPhysics(),
      padding: EdgeInsets.only(bottom: bottomPadding),
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
                  : const Opacity(
                      opacity: 0,
                      child: SizedBox(width: 45, height: 45),
                    ),
            ),

            const SizedBox(height: 16),

            // ── Hero Text ────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.only(left: 24, right: 55),
              child: isKnockoutLayer
                  ? _buildHeroText(Colors.black)
                  : Opacity(opacity: 0, child: _buildHeroText(Colors.white)),
            ),

            const SizedBox(height: 28),

            // ── Static intro paragraphs ──────────────────────────────
            ...recommendation.pitch.map(
              (paragraph) => Padding(
                padding: const EdgeInsets.only(left: 24, right: 24, bottom: 20),
                child: isKnockoutLayer
                    ? _buildBodyText(paragraph, Colors.black)
                    : Opacity(
                        opacity: 0,
                        child: _buildBodyText(paragraph, Colors.white),
                      ),
              ),
            ),

            // ── Live chat messages ───────────────────────────────────
            for (final msg in messages) ...[
              if (msg.isUser)
                Padding(
                  padding: const EdgeInsets.only(left: 48, right: 24, bottom: 20),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: _buildChatBubble(msg.text),
                  ),
                )
              else ...[
                // Coda reply in body-text style
                Padding(
                  padding: EdgeInsets.only(left: 24, right: 24, bottom: msg.recommendation != null ? 12 : 20),
                  child: isKnockoutLayer
                      ? _buildBodyText(msg.text, Colors.black)
                      : Opacity(
                          opacity: 0,
                          child: _buildBodyText(msg.text, Colors.white),
                        ),
                ),
                // "See the Pick" button if recommendation is ready
                if (msg.recommendation != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 24, right: 24, bottom: 20),
                    child: _buildSeeThePickButton(msg.recommendation!),
                  ),
              ],
            ],

            // ── Loading indicator ────────────────────────────────────
            if (isLoading)
              Padding(
                padding: const EdgeInsets.only(left: 24, right: 24, bottom: 20),
                child: isKnockoutLayer
                    ? _buildBodyText('Coda is thinking...', Colors.black)
                    : Opacity(
                        opacity: 0,
                        child: _buildBodyText('Coda is thinking...', Colors.white),
                      ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroText(Color color) {
    return Text(
      recommendation.codaBlurb,
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
        fontWeight: FontWeight.w700,
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

  Widget _buildSeeThePickButton(Recommendation rec) {
    if (isKnockoutLayer) {
      // Knockout: punch a solid pill hole
      return Container(
        height: 50,
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(25),
        ),
      );
    }

    // Visible layer: the real interactive button drawn over the knockout hole
    return GestureDetector(
      onTap: () => onSeeThePick(rec),
      child: Container(
        height: 50,
        padding: const EdgeInsets.only(left: 20, right: 20),
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(25),
        ),
        alignment: Alignment.centerLeft,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'See the Pick',
              style: GoogleFonts.inter(
                color: Colors.black.withValues(alpha: 0.7),
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            Icon(
              Icons.arrow_forward,
              color: Colors.black.withValues(alpha: 0.7),
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Prompt Bar
// ═══════════════════════════════════════════════════════════════════════
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
    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final isKeyboardOpen = keyboardHeight > 0;
    final safeBottom = MediaQuery.of(context).padding.bottom;

    final bottomPadding = isKeyboardOpen
        ? 16.0
        : safeBottom + 83.0;

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
