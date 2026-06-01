import 'dart:ui' as dart_ui;
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class PitchScreen extends ConsumerStatefulWidget {
  const PitchScreen({required this.recommendation, super.key});

  final Recommendation recommendation;

  @override
  ConsumerState<PitchScreen> createState() => _PitchScreenState();
}

class _PitchScreenState extends ConsumerState<PitchScreen> with SingleTickerProviderStateMixin {
  final _maskScrollController = ScrollController();
  final _topScrollController = ScrollController();
  final _chatController = TextEditingController();
  final _chatFocusNode = FocusNode();
  late final AnimationController _animationController;
  final List<String> _messages = [];

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _topScrollController.addListener(() {
      if (_maskScrollController.hasClients &&
          _topScrollController.offset != _maskScrollController.offset) {
        _maskScrollController.jumpTo(_topScrollController.offset);
      }
    });

    _chatFocusNode.addListener(() {
      if (_chatFocusNode.hasFocus) {
        Future.delayed(const Duration(milliseconds: 400), () {
          if (mounted && _chatFocusNode.hasFocus) {
            _animationController.forward();
          }
        });
      } else {
        Future.delayed(const Duration(milliseconds: 150), () {
          if (mounted && !_chatFocusNode.hasFocus) {
            _animationController.reverse();
          }
        });
      }
      setState(() {});
    });
  }

  @override
  void dispose() {
    _animationController.dispose();
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
      _chatFocusNode.unfocus();
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
    final rec = widget.recommendation;

    return PopScope<Object?>(
      canPop: !_chatFocusNode.hasFocus,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (_chatFocusNode.hasFocus) {
          _chatFocusNode.unfocus();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF0A0A0C),
        resizeToAvoidBottomInset: true,
      body: LayoutBuilder(
        builder: (context, constraints) {
          final screenHeight = MediaQuery.of(context).size.height;
          final screenWidth = MediaQuery.of(context).size.width;

          return Stack(
            children: [
              // ── Full-screen blurred poster background ───────────────────
              Positioned(
                top: 0,
                left: 0,
                width: screenWidth,
                height: screenHeight,
                child: rec.posterUrl != null
                    ? Transform.scale(
                        scale: 1.2,
                        child: ImageFiltered(
                          imageFilter: dart_ui.ImageFilter.blur(
                            sigmaX: 80,
                            sigmaY: 80,
                            tileMode: dart_ui.TileMode.mirror,
                          ),
                          child: Image(
                            image: rec.posterUrl!.startsWith('assets/')
                                ? AssetImage(rec.posterUrl!) as ImageProvider
                                : NetworkImage(rec.posterUrl!),
                            fit: BoxFit.cover,
                          ),
                        ),
                      )
                    : Container(color: const Color(0xFF101114)),
              ),

              // ── Global 15% White Overlay (brightens all cutouts) ──────────
              Positioned(
                top: 0,
                left: 0,
                width: screenWidth,
                height: screenHeight,
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
                              messages: _messages,
                            ),
                          ),
                        ),
                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: _BottomPills(
                            isKnockoutLayer: true,
                            animation: _animationController,
                            onLetsTalk: () {},
                            onThisIsIt: () {},
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
                      child: _BottomPills(
                        isKnockoutLayer: false,
                        animation: _animationController,
                        onLetsTalk: () {
                          _chatFocusNode.requestFocus();
                        },
                        onThisIsIt: () {
                          ref
                              .read(activeSessionProvider.notifier)
                              .start(widget.recommendation);
                          context.go('/session');
                        },
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
                      opacity:
                          0, // No longer needed, background is brightened globally
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

class _BottomPills extends StatelessWidget {
  const _BottomPills({
    required this.isKnockoutLayer,
    required this.animation,
    required this.onLetsTalk,
    required this.onThisIsIt,
    required this.chatController,
    required this.chatFocusNode,
    required this.onSend,
  });

  final bool isKnockoutLayer;
  final Animation<double> animation;
  final VoidCallback onLetsTalk;
  final VoidCallback onThisIsIt;
  final TextEditingController chatController;
  final FocusNode chatFocusNode;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final safeBottom = MediaQuery.of(context).padding.bottom;
    final bottomPadding = safeBottom > 0 ? safeBottom : 16.0;

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        bottom: bottomPadding,
        top: 8,
      ),
      child: SizedBox(
        height: 51,
        child: LayoutBuilder(
          builder: (context, constraints) {
            return AnimatedBuilder(
              animation: animation,
              builder: (context, child) {
                final t = animation.value;
                final totalWidth = constraints.maxWidth;
                final initialBtnWidth = (totalWidth - 12) / 2;

                // Text Opacity
                double textOpacity = 1.0;
                if (t > 0.0 && t <= 0.1) {
                  textOpacity = 1.0 - (t / 0.1);
                } else if (t > 0.1 && t < 0.9) {
                  textOpacity = 0.0;
                } else if (t >= 0.9 && t <= 1.0) {
                  textOpacity = (t - 0.9) / 0.1;
                }

                // This Is It Width and Gap
                double thisIsItWidth = initialBtnWidth;
                double gap = 12.0;
                
                if (t > 0.1 && t <= 0.6) {
                  final progress = (t - 0.1) / 0.5;
                  thisIsItWidth = dart_ui.lerpDouble(initialBtnWidth, 51.0, progress) ?? 51.0;
                } else if (t > 0.6 && t <= 0.9) {
                  final progress = (t - 0.6) / 0.3;
                  thisIsItWidth = dart_ui.lerpDouble(51.0, 0.0, progress) ?? 0.0;
                  gap = dart_ui.lerpDouble(12.0, 0.0, progress) ?? 0.0;
                } else if (t > 0.9) {
                  thisIsItWidth = 0.0;
                  gap = 0.0;
                }

                // Let's Talk Width
                double letsTalkWidth = totalWidth - thisIsItWidth - gap;

                // This Is It Button Opacity
                double thisIsItOpacity = 1.0;
                if (t > 0.6 && t <= 0.9) {
                  final progress = (t - 0.6) / 0.3;
                  thisIsItOpacity = 1.0 - progress;
                } else if (t > 0.9) {
                  thisIsItOpacity = 0.0;
                }

                final buttonDecoration = BoxDecoration(
                  color: isKnockoutLayer ? Colors.black : Colors.transparent,
                  borderRadius: BorderRadius.circular(50),
                );

                return Row(
                  children: [
                    // ── Let's Talk button ─────────────────────
                    GestureDetector(
                      onTap: isKnockoutLayer ? null : onLetsTalk,
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        width: letsTalkWidth,
                        height: 51,
                        decoration: buttonDecoration,
                        child: Opacity(
                          opacity: isKnockoutLayer ? 0.0 : textOpacity,
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
                                  if (t > 0.0) ...[
                                    GestureDetector(
                                      onTap: onSend,
                                      behavior: HitTestBehavior.opaque,
                                      child: Padding(
                                        padding: const EdgeInsets.only(left: 8.0, top: 8.0, bottom: 8.0),
                                        child: Opacity(
                                          opacity: isKnockoutLayer ? 0.0 : (t >= 0.9 ? (t - 0.9) / 0.1 : 0.0),
                                          child: Icon(
                                            PhosphorIconsFill.paperPlaneTilt,
                                            color: Colors.black.withValues(alpha: 0.7),
                                            size: 20,
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
                    ),

                    if (gap > 0) SizedBox(width: gap),

                    // ── This is it button ─────────────────────
                    if (thisIsItWidth > 0)
                      GestureDetector(
                        onTap: isKnockoutLayer ? null : onThisIsIt,
                        behavior: HitTestBehavior.opaque,
                        child: Opacity(
                          opacity: thisIsItOpacity,
                          child: Container(
                            width: thisIsItWidth,
                            height: 51,
                            decoration: buttonDecoration,
                            clipBehavior: Clip.antiAlias,
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              physics: const NeverScrollableScrollPhysics(),
                              child: SizedBox(
                                width: initialBtnWidth,
                                child: Opacity(
                                  opacity: isKnockoutLayer ? 0.0 : textOpacity,
                                  child: Container(
                                    padding: const EdgeInsets.only(left: 20, right: 32),
                                    alignment: Alignment.centerLeft,
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(
                                          Icons.play_arrow_rounded,
                                          color: Colors.black.withValues(alpha: 0.7),
                                          size: 24,
                                        ),
                                        const SizedBox(width: 3),
                                        Text(
                                          'This is it',
                                          style: GoogleFonts.inter(
                                            color: Colors.black.withValues(alpha: 0.7),
                                            fontSize: 18,
                                            fontWeight: FontWeight.w900,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }
}
