import 'dart:ui' as dart_ui;
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

const _askRecommendation = Recommendation(
  id: 'ask-coda',
  title: 'Ask Coda',
  mediaType: MediaType.movie,
  codaBlurb: 'Tell me what you are looking for\nI’ll find the one.',
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
    "Just talk to me. I’ll find the one",
  ],
);

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
  final List<String> _messages = [];

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
        final double height = constraints.maxHeight;
        
        double stopStart = 0.0;
        double stopEnd = 1.0;
        
        if (height > 0 && !height.isInfinite) {
          final double fadeEnd = height - 70;
          final double fadeStart = fadeEnd - 100;
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
    final activeRec = ref.watch(homeRecommendationProvider);
    final posterUrl = activeRec?.posterUrl;
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
        resizeToAvoidBottomInset: true,
        body: LayoutBuilder(
          builder: (context, constraints) {
            final screenHeight = MediaQuery.of(context).size.height;
            final screenWidth = MediaQuery.of(context).size.width;

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
                              _PitchLayout(
                                recommendation: rec,
                                isKnockoutLayer: true,
                                scrollController: _maskScrollController,
                                messages: _messages,
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
  });

  final Recommendation recommendation;
  final bool isKnockoutLayer;
  final ScrollController scrollController;
  final List<String> messages;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      controller: scrollController,
      physics: isKnockoutLayer
          ? const NeverScrollableScrollPhysics()
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
              padding: const EdgeInsets.only(left: 24, right: 55),
              child: isKnockoutLayer
                  ? _buildHeroText(Colors.black)
                  : Opacity(opacity: 0, child: _buildHeroText(Colors.white)),
            ),

            const SizedBox(height: 28),

            // ── Body Paragraphs ──────────────────────────────────────
            ...recommendation.pitch.map(
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

            // ── User Chat Messages ───────────────────────────────────
            for (final message in messages)
              Padding(
                padding: const EdgeInsets.only(left: 48, right: 24, bottom: 20),
                child: Align(
                  alignment: Alignment.centerRight,
                  child: _buildChatBubble(message),
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
        : safeBottom + 16.0 + 51.0 + 16.0;

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
