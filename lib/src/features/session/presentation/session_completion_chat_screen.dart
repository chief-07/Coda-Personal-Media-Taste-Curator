import 'dart:ui' as dart_ui;
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';
import 'package:coda/src/features/session/application/session_chat_controller.dart';
import 'package:coda/src/features/session/application/archived_sessions_controller.dart';
import 'package:coda/src/features/session/domain/archived_session.dart';
import 'package:coda/src/features/home/presentation/widgets/sparkle_loader.dart';

class SessionCompletionChatScreen extends ConsumerStatefulWidget {
  const SessionCompletionChatScreen({super.key, this.sessionId});

  final String? sessionId;

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

  void _sendMessage(String resolvedSessionId) {
    final text = _chatController.text.trim();
    if (text.isNotEmpty) {
      ref.read(sessionChatControllerProvider(resolvedSessionId).notifier).sendMessage(text);
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
    final activeRec = ref.watch(activeSessionProvider) ?? ref.watch(homeRecommendationProvider).value;
    final archivedSessions = ref.watch(archivedSessionsProvider);

    Recommendation? recommendation;
    String resolvedSessionId;

    if (widget.sessionId != null) {
      resolvedSessionId = widget.sessionId!;
      final session = archivedSessions.firstWhere(
        (s) => s.id == resolvedSessionId,
        orElse: () => ArchivedSession(
          id: resolvedSessionId,
          title: 'Media Pick',
          mediaType: 'movie',
          posterUrl: '',
          oneLineSummary: '',
          chatHistory: [],
          archivedAt: DateTime.now(),
        ),
      );

      recommendation = Recommendation(
        id: session.id,
        title: session.title,
        mediaType: MediaType.values.firstWhere(
          (e) => e.name == session.mediaType,
          orElse: () {
            final name = session.mediaType;
            final label = name.isEmpty
                ? 'Custom'
                : name[0].toUpperCase() + name.substring(1);
            return MediaType(name: name, label: label, isCustom: true);
          },
        ),
        codaBlurb: '',
        codaNote: '',
        description: '',
        genres: [],
        tags: [],
        fitSignals: [],
        posterGradient: const [Color(0xFF0F1A1C), Color(0xFF1E353B)],
        releaseYear: '',
        pitch: const [],
        posterUrl: session.posterUrl.isNotEmpty ? session.posterUrl : null,
      );
    } else {
      recommendation = activeRec;
      resolvedSessionId = activeRec?.id ?? 'active_session';

      // Auto-archive active session when started if it does not exist in the archive yet
      if (activeRec != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final archived = ref.read(archivedSessionsProvider);
          final exists = archived.any((s) => s.id == activeRec.id);
          if (!exists) {
            final initialMsg = ChatMessage(
              text: 'What did you think of ${activeRec.title}?',
              isUser: false,
            );
            final newSession = ArchivedSession(
              id: activeRec.id,
              title: activeRec.title,
              mediaType: activeRec.mediaType.name,
              posterUrl: activeRec.posterUrl ?? '',
              oneLineSummary: 'Chatting about ${activeRec.title}...',
              chatHistory: [initialMsg],
              archivedAt: DateTime.now(),
            );
            ref.read(archivedSessionsProvider.notifier).archiveOrUpdateSession(newSession);
          }
        });
      }
    }

    final sessionChatState = ref.watch(sessionChatControllerProvider(resolvedSessionId));
    final messages = sessionChatState.messages;
    final isLoading = sessionChatState.isLoading;

    ref.listen<SessionChatState>(sessionChatControllerProvider(resolvedSessionId), (previous, next) {
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
        if (didPop) {
          if (widget.sessionId == null) {
            // Trigger a home screen refresh for this media type so the user sees a new pick next
            if (activeRec != null) {
              ref.read(homeRecommendationProvider.notifier).clearActivePickQueue(activeRec.mediaType);
            }
            ref.read(activeSessionProvider.notifier).clear();
          }
          return;
        }
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
                child: recommendation != null && recommendation.posterUrl != null && recommendation.posterUrl!.isNotEmpty
                    ? Transform.scale(
                        scale: 1.2,
                        child: ImageFiltered(
                          key: ValueKey(recommendation.posterUrl),
                          imageFilter: dart_ui.ImageFilter.blur(
                            sigmaX: 80,
                            sigmaY: 80,
                            tileMode: TileMode.mirror,
                          ),
                          child: FallbackImage(
                            url: recommendation.posterUrl,
                            fit: BoxFit.cover,
                            width: double.infinity,
                            height: double.infinity,
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
                            recommendation: recommendation,
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

            // ── Layer 2: Normal visible elements ───────────────────────
            Positioned.fill(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: _buildFadedContent(
                      _PitchLayout(
                        recommendation: recommendation,
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
                      onSend: () => _sendMessage(resolvedSessionId),
                    ),
                  ),
                  
                  // Sticky Header with only Back Button
                  Positioned(
                    top: MediaQuery.of(context).padding.top + 8,
                    left: 16,
                    child: GestureDetector(
                      onTap: () {
                        if (widget.sessionId == null) {
                          ref.read(activeSessionProvider.notifier).clear();
                        }
                        context.go('/home');
                      },
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

  final Recommendation? recommendation;
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
                  : Image.asset(
                      'assets/images/coda_logo.png',
                      width: 45,
                      height: 45,
                      fit: BoxFit.contain,
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

            const SizedBox(height: 16),

            // ── Body Text ────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: isKnockoutLayer
                  ? _buildBodyText(
                      "Tell me everything! Did you love it? Did it connect with you? Did you cry? Was it not what you expected?",
                      Colors.black,
                    )
                  : Opacity(
                      opacity: 0,
                      child: _buildBodyText(
                        "Tell me everything! Did you love it? Did it connect with you? Did you cry? Was it not what you expected?",
                        Colors.white,
                      ),
                    ),
            ),

            const SizedBox(height: 28),

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
              else
                _buildCodaMessage(messages[i].text ?? ''),
            ],

            if (isLoading)
              Padding(
                padding: const EdgeInsets.only(left: 24, right: 24, bottom: 20),
                child: isKnockoutLayer
                    ? Icon(
                        PhosphorIcons.sparkle(PhosphorIconsStyle.fill),
                        color: Colors.black,
                        size: 28,
                      )
                    : const SparkleLoader(
                        color: Colors.white,
                        size: 28,
                      ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroText(Color color) {
    final titleText = recommendation?.title ?? 'this';
    return Text(
      'What did you think about $titleText?',
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
                      hintText: "Let's talk",
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
