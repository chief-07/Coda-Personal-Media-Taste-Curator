import 'dart:ui' as dart_ui;
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';

const _askRecommendation = Recommendation(
  id: 'session-chat',
  title: 'Coda Discussion',
  mediaType: MediaType.movie,
  codaBlurb: 'Let\'s talk about what\nyou just finished',
  codaNote: '',
  description: '',
  genres: [],
  tags: [],
  fitSignals: [],
  posterGradient: [Color(0xFF0F1A1C), Color(0xFF1E353B), Color(0xFF4C7D8A)],
  releaseYear: '2026',
  pitch: [
    "I'd love to hear your thoughts on this.",
    "Did it hit you in the way you expected? What was your favorite moment?",
    "Let me know what you liked or what fell flat, and I'll use it to refine your taste profile.",
  ],
);

class SessionCompletionChatScreen extends ConsumerStatefulWidget {
  const SessionCompletionChatScreen({super.key});

  @override
  ConsumerState<SessionCompletionChatScreen> createState() => _SessionCompletionChatScreenState();
}

class _SessionCompletionChatScreenState extends ConsumerState<SessionCompletionChatScreen> {
  final _maskScrollController = ScrollController();
  final _topScrollController = ScrollController();
  final _chatController = TextEditingController();
  final _chatFocusNode = FocusNode();

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
      // For now, use the same onboarding controller logic or simulate a simple echoing reply
      ref.read(onboardingControllerProvider.notifier).sendMessage(text);
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
          final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
          final isKeyboardOpen = keyboardHeight > 0;
          final safeBottom = MediaQuery.of(context).padding.bottom;
          
          final bottomPadding = isKeyboardOpen
              ? keyboardHeight + 16.0
              : safeBottom + 24.0;
          
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
    final activeRec = ref.watch(homeRecommendationProvider).value;
    const rec = _askRecommendation;

    final onboardingState = ref.watch(onboardingControllerProvider);
    final messages = onboardingState.messages;
    final isLoading = onboardingState.isLoading;

    ref.listen(onboardingControllerProvider, (previous, next) {
      if (previous?.messages.length != next.messages.length ||
          previous?.isLoading != next.isLoading) {
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
    });

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
                            messages: messages,
                            isLoading: isLoading,
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
                        messages: messages,
                        isLoading: isLoading,
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
                  
                  // Sticky Header with Completed Media Details and Back Button
                  Positioned(
                    top: MediaQuery.of(context).padding.top + 8,
                    left: 16,
                    right: 16,
                    child: Row(
                      children: [
                        GestureDetector(
                          onTap: () => context.go('/home'),
                          child: Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white.withValues(alpha: 0.08),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.12),
                              ),
                            ),
                            child: const Icon(
                              PhosphorIconsBold.caretLeft,
                              color: Colors.white,
                              size: 20,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        if (activeRec != null) ...[
                          Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.15),
                              ),
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: FallbackImage(
                                url: activeRec.posterUrl,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              activeRec.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.inter(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ],
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

class _PitchLayout extends StatelessWidget {
  const _PitchLayout({
    required this.recommendation,
    required this.isKnockoutLayer,
    required this.scrollController,
    required this.messages,
    required this.isLoading,
  });

  final Recommendation recommendation;
  final bool isKnockoutLayer;
  final ScrollController scrollController;
  final List<ChatMessage> messages;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final bottomPadding = 180.0 + keyboardHeight;

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
            const SizedBox(height: 70), // space for sticky header

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
                        opacity: 0,
                        child: _buildBodyText(paragraph, Colors.white),
                      ),
              ),
            ),

            // ── Messages List ────────────────────────────────────────
            for (var i = 0; i < messages.length; i++) ...[
              if (messages[i].isUser)
                Padding(
                  padding: const EdgeInsets.only(left: 48, right: 24, bottom: 20),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: _buildChatBubble(messages[i].text ?? ''),
                  ),
                )
              else if (messages[i].chips != null)
                Padding(
                  padding: const EdgeInsets.only(left: 24, right: 24, bottom: 40),
                  child: _buildChipsWrap(context, messages[i].chips!),
                )
              else
                _buildCodaMessage(messages[i].text ?? ''),
            ],

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

  Widget _buildCodaMessage(String text) {
    return Padding(
      padding: const EdgeInsets.only(left: 24, right: 24, bottom: 20),
      child: isKnockoutLayer
          ? _buildBodyText(text, Colors.black)
          : Opacity(
              opacity: 0,
              child: _buildBodyText(text, Colors.white),
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

  Widget _buildChipsWrap(BuildContext context, List<String> chipsList) {
    return Wrap(
      spacing: 8,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        ...chipsList.map((chip) => _buildOutlineChip(chip)),
        GestureDetector(
          onTap: () => context.push('/taste-profile'),
          child: _buildCheckmarkButton(),
        ),
      ],
    );
  }

  Widget _buildOutlineChip(String text) {
    if (isKnockoutLayer) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.black, width: 1.5),
          borderRadius: BorderRadius.circular(50),
        ),
        child: Text(
          text,
          style: GoogleFonts.inter(
            color: Colors.black,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }

    return Opacity(
      opacity: 0,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.black, width: 1.5),
          borderRadius: BorderRadius.circular(50),
        ),
        child: Text(
          text,
          style: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _buildCheckmarkButton() {
    if (isKnockoutLayer) {
      return Container(
        width: 48,
        height: 36,
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(50),
        ),
      );
    }

    return SizedBox(
      width: 48,
      height: 36,
      child: Center(
        child: Icon(
          Icons.check,
          size: 24,
          weight: 900,
          color: Colors.black.withValues(alpha: 0.7),
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
    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final isKeyboardOpen = keyboardHeight > 0;
    final safeBottom = MediaQuery.of(context).padding.bottom;
    
    final bottomPadding = isKeyboardOpen
        ? keyboardHeight + 16.0
        : safeBottom + 24.0;

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
                      hintText: "Tell Coda what you thought...",
                      hintStyle: GoogleFonts.inter(
                        color: Colors.black.withValues(alpha: 0.7),
                        fontSize: 16,
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
