import 'dart:async';
import 'dart:convert';
import 'dart:io' show File;
import 'dart:math' as math;
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/core/providers/api_config.dart';
import 'package:coda/src/core/providers/watchlist_mode_provider.dart';
import 'package:coda/src/core/providers/memories_mode_provider.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/recommendation/data/recommendation_service.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/features/ask/presentation/web_recorder_stub.dart'
    if (dart.library.html) 'package:coda/src/features/ask/presentation/web_recorder_web.dart';
import 'dart:ui' as dart_ui;
import 'package:coda/src/core/theme/ambient_bloom.dart';
import 'package:coda/src/features/home/presentation/widgets/walrus_memory_sheet.dart';
import 'package:coda/src/features/home/presentation/widgets/sparkle_loader.dart';
import 'package:coda/src/features/shell/presentation/coda_shell.dart';
import 'package:coda/src/features/home/presentation/widgets/fallback_image.dart';


// ═══════════════════════════════════════════════════════════════════════
// Message model
// ═══════════════════════════════════════════════════════════════════════
class AskChatMessage {
  final String text;
  final bool isUser;
  /// If non-null, this Coda message came with a completed recommendation
  final Recommendation? recommendation;
  final String? savedMemory;
  final String? recalledMemory;

  AskChatMessage({
    required this.text,
    required this.isUser,
    this.recommendation,
    this.savedMemory,
    this.recalledMemory,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Session Persistence Provider
// ═══════════════════════════════════════════════════════════════════════
class AskChatSessionNotifier extends Notifier<List<AskChatMessage>> {
  @override
  List<AskChatMessage> build() {
    return [];
  }

  void addMessage(AskChatMessage message) {
    state = [...state, message];
  }

  void clearSession() {
    state = [];
  }
}

final askChatSessionProvider = NotifierProvider<AskChatSessionNotifier, List<AskChatMessage>>(
  AskChatSessionNotifier.new,
);

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

  bool _isLoading = false;

  final _audioRecorder = CodaAudioRecorder();
  bool _isRecording = false;
  Timer? _longPressTimer;
  bool _isLongPressActive = false;

  @override
  void initState() {
    super.initState();
    _chatFocusNode.addListener(() {
      if (mounted) setState(() {});
    });
    _topScrollController.addListener(() {
      if (_maskScrollController.hasClients &&
          _topScrollController.offset != _maskScrollController.offset) {
        _maskScrollController.jumpTo(_topScrollController.offset);
      }
    });
  }

  @override
  void dispose() {
    _longPressTimer?.cancel();
    _audioRecorder.dispose();
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

  void _handlePointerDown(PointerDownEvent event) {
    if (_isLoading) return;
    if (_chatFocusNode.hasFocus) return;
    _isLongPressActive = false;
    _longPressTimer?.cancel();
    _longPressTimer = Timer(const Duration(milliseconds: 500), () {
      _isLongPressActive = true;
      _startRecording();
    });
  }

  void _handlePointerUp(PointerUpEvent event) {
    _longPressTimer?.cancel();
    if (_isLongPressActive) {
      _stopRecording();
    } else {
      if (!_chatFocusNode.hasFocus) {
        _chatFocusNode.requestFocus();
      }
    }
  }

  void _handlePointerCancel(PointerCancelEvent event) {
    _longPressTimer?.cancel();
    if (_isLongPressActive) {
      _cancelRecording();
    }
  }

  Future<void> _startRecording() async {
    try {
      if (await _audioRecorder.hasPermission()) {
        if (!kIsWeb) {
          await HapticFeedback.lightImpact();
        }

        setState(() {
          _isRecording = true;
        });

        String path = kIsWeb ? 'audio.webm' : 'audio.m4a';
        if (!kIsWeb) {
          final tempDir = await getTemporaryDirectory();
          path = '${tempDir.path}/audio.m4a';
          final file = File(path);
          if (await file.exists()) {
            await file.delete();
          }
        }

        await _audioRecorder.start(
          path: path,
        );
      } else {
        if (mounted) {
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
                        'Microphone Access Required',
                        style: GoogleFonts.inter(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        kIsWeb
                            ? 'Coda needs microphone access for speech-to-text.\n\n'
                                'Please click the site settings or lock icon next to the URL in your browser\'s address bar, allow the Microphone permission, and try again.'
                            : 'Coda needs microphone access for speech-to-text.\n\n'
                                'Please open your device settings, locate the Coda app, and enable Microphone permissions.',
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
                              'Got it',
                              style: GoogleFonts.inter(
                                color: Colors.white,
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
      }
    } catch (e) {
      debugPrint('Error starting record: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to start recording: $e'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      setState(() {
        _isRecording = false;
      });
    }
  }

  Future<void> _stopRecording() async {
    if (!_isRecording) return;
    try {
      final pathResult = await _audioRecorder.stop();
      setState(() {
        _isRecording = false;
      });

      if (pathResult != null) {
        _transcribeAndSend(pathResult);
      }
    } catch (e) {
      debugPrint('Error stopping record: $e');
      setState(() {
        _isRecording = false;
      });
    }
  }

  Future<void> _cancelRecording() async {
    if (!_isRecording) return;
    try {
      await _audioRecorder.stop();
      setState(() {
        _isRecording = false;
      });
    } catch (e) {
      debugPrint('Error cancelling record: $e');
    }
  }

  Future<void> _transcribeAndSend(String path) async {
    setState(() {
      _isLoading = true;
    });

    try {
      Uint8List bytes;
      if (kIsWeb) {
        final response = await http.get(Uri.parse(path));
        bytes = response.bodyBytes;
      } else {
        bytes = await File(path).readAsBytes();
      }

      if (bytes.isEmpty) {
        throw Exception('Audio recording was empty.');
      }

      final baseUrl = getApiBaseUrl();
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/api/chat/transcribe'),
      );

      final filename = kIsWeb ? 'audio.webm' : 'audio.m4a';
      final multipartFile = http.MultipartFile.fromBytes(
        'file',
        bytes,
        filename: filename,
      );
      request.files.add(multipartFile);

      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final transcript = data['text'] as String? ?? '';
        if (transcript.trim().isNotEmpty) {
          _chatController.text = transcript;
          _sendMessage();
        } else {
          _showErrorSnackBar('Could not understand the audio. Please try again.');
        }
      } else {
        throw Exception('Server returned status ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Transcription error: $e');
      _showErrorSnackBar('Audio unclear, please tap to try again.');
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _showErrorSnackBar(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        padding: EdgeInsets.zero,
        duration: const Duration(seconds: 4),
        content: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: BackdropFilter(
            filter: dart_ui.ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.22),
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.25),
                    blurRadius: 18,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Row(
                children: [
                  const Text('⚠️ ', style: TextStyle(fontSize: 16)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      message,
                      style: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.2,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _sendMessage() async {
    final text = _chatController.text.trim();
    if (text.isEmpty || _isLoading) return;

    final chatHistory = ref.read(askChatSessionProvider).map((m) {
      var text = m.text;
      if (m.recommendation != null) {
        text += '\n[System: Coda recommended the work: "${m.recommendation!.title}" (${m.recommendation!.mediaType.label})]';
      }
      return {'isUser': m.isUser, 'text': text};
    }).toList();

    ref.read(askChatSessionProvider.notifier).addMessage(
      AskChatMessage(text: text, isUser: true),
    );

    setState(() {
      _isLoading = true;
    });
    _chatController.clear();
    _chatFocusNode.unfocus();
    _scrollToBottom();

    try {
      final memory = ref.read(livingMemoryProvider);
      final isWatchlistMode = ref.read(watchlistModeProvider);
      final isMemoriesEnabled = ref.read(memoriesModeProvider);
      final response = await ref.read(recommendationServiceProvider).sendAskChatMessage(
        memory: memory,
        chatHistory: chatHistory,
        userMessage: text,
        watchlistOnly: isWatchlistMode,
        memoriesEnabled: isMemoriesEnabled,
      );

      if (!mounted) return;

      final status = response['status'] as String? ?? 'chatting';
      final message = response['message'] as String? ?? '';
      Recommendation? recommendation;

      if ((status == 'success' || status == 'match') && response['recommendation'] != null) {
        final recData = response['recommendation'] as Map<String, dynamic>;
        try {
          final result = RecommendationResult.fromJson(recData);
          recommendation = result.toDomain();
        } catch (e) {
          debugPrint('Failed to parse recommendation from Ask Coda: $e');
        }
      }

      ref.read(askChatSessionProvider.notifier).addMessage(
        AskChatMessage(
          text: message,
          isUser: false,
          recommendation: recommendation,
          savedMemory: isMemoriesEnabled ? response['saved_memory'] as String? : null,
          recalledMemory: isMemoriesEnabled ? response['recalled_memory'] as String? : null,
        ),
      );
      setState(() {
        _isLoading = false;
      });
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      ref.read(askChatSessionProvider.notifier).addMessage(
        AskChatMessage(
          text: "[Debug Error (Ask Chat)]: $e",
          isUser: false,
        ),
      );
      setState(() {
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
              ? keyboardHeight + 16.0
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
    final activeRec = ref.watch(homeRecommendationProvider).value;
    final messages = ref.watch(askChatSessionProvider);

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
        resizeToAvoidBottomInset: false,
        body: LayoutBuilder(
          builder: (context, constraints) {
            final screenHeight = MediaQuery.of(context).size.height;
            final screenWidth = MediaQuery.of(context).size.width;

            final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
            final isKeyboardOpen = keyboardHeight > 0;
            final safeBottom = MediaQuery.of(context).padding.bottom;

            return Stack(
              children: [
                // ── Background ──
                Positioned(
                  top: 0,
                  left: 0,
                  width: screenWidth,
                  height: screenHeight,
                  child: Stack(
                    children: [
                      // Base background color
                      Positioned.fill(
                        child: Container(color: const Color(0xFF101114)),
                      ),
                      // Default background blurred image
                      Positioned.fill(
                        child: Transform.scale(
                          scale: 1.2,
                          child: ImageFiltered(
                            imageFilter: dart_ui.ImageFilter.blur(
                              sigmaX: 80,
                              sigmaY: 80,
                              tileMode: dart_ui.TileMode.mirror,
                            ),
                            child: const Image(
                              image: AssetImage('assets/images/default_bg.jpg'),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                      ),
                      // Active recommendation blurred poster (if available)
                      if (activeRec != null &&
                          activeRec.posterUrl != null &&
                          activeRec.posterUrl!.isNotEmpty &&
                          !activeRec.posterUrl!.startsWith('holder:'))
                        Positioned.fill(
                          child: Transform.scale(
                            scale: 1.2,
                            child: ImageFiltered(
                              imageFilter: dart_ui.ImageFilter.blur(
                                sigmaX: 80,
                                sigmaY: 80,
                                tileMode: dart_ui.TileMode.mirror,
                              ),
                              child: FallbackImage(
                                url: activeRec.posterUrl,
                                fit: BoxFit.cover,
                                errorWidget: const SizedBox.shrink(),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),

                // ── Global 15% White Overlay (brightens all cutouts) ──────────
                Positioned(
                  top: 0,
                  left: 0,
                  width: screenWidth,
                  height: screenHeight,
                  child: Container(color: Colors.white.withValues(alpha: 0.05)),
                ),

                // ── Screen-Wide Ambient Glow Bloom & Breathing Pulse ─────────
                const AmbientBloomLayer(),

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
                              isRecording: _isRecording,
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
                          isRecording: _isRecording,
                          onPointerDown: _handlePointerDown,
                          onPointerUp: _handlePointerUp,
                          onPointerCancel: _handlePointerCancel,
                        ),
                      ),
                    ],
                  ),
                ),

                // ── Floating glass back button ──────────────────────────────
                Positioned(
                  top: MediaQuery.of(context).padding.top + 12,
                  left: 16,
                  child: GestureDetector(
                    onTap: () => context.pop(),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(50),
                      child: BackdropFilter(
                        filter: dart_ui.ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                        child: Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(50),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.15),
                              width: 1,
                            ),
                          ),
                          child: const Icon(
                            Icons.arrow_back_ios_new_rounded,
                            color: Colors.white,
                            size: 16,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

                // ── Floating navbar ──────────────────────────────
                if (!isKeyboardOpen)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: safeBottom + 16.0,
                    child: Center(
                      child: FloatingNavBar(
                        currentIndex: 2, // Ask Coda is index 2
                        onTap: (index) {
                          if (index != 2) {
                            if (index == 0) {
                              context.go('/library');
                            } else if (index == 1) {
                              context.go('/home');
                            }
                          }
                        },
                      ),
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
class _PitchLayout extends ConsumerWidget {
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
  final List<AskChatMessage> messages;
  final bool isLoading;
  final void Function(Recommendation rec) onSeeThePick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final isKeyboardOpen = keyboardHeight > 0;
    final safeBottom = MediaQuery.of(context).padding.bottom;
    final bottomPadding = isKeyboardOpen
        ? keyboardHeight + 120.0
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
            const SizedBox(height: 80),

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
                // Inline Walrus Memory pills
                if (ref.watch(memoriesModeProvider) && msg.recalledMemory != null && msg.recalledMemory!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(left: 24, right: 24, bottom: 12),
                    child: _buildMemoryProvenancePill(context, msg.recalledMemory!, isSaved: false, rec: msg.recommendation),
                  ),
                if (ref.watch(memoriesModeProvider) && msg.savedMemory != null && msg.savedMemory!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(left: 24, right: 24, bottom: 12),
                    child: _buildMemoryProvenancePill(context, msg.savedMemory!, isSaved: true),
                  ),
                // "See the Pick" button if recommendation is ready
                if (msg.recommendation != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 24, right: 24, bottom: 20),
                    child: _buildSeeThePickButton(msg.recommendation!),
                  ),
              ],
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

  Widget _buildMemoryProvenancePill(BuildContext context, String memoryText, {required bool isSaved, Recommendation? rec}) {
    final label = isSaved ? 'Saved to Walrus Memory' : 'Recalled from Walrus Memory';

    if (isKnockoutLayer) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(50),
          border: Border.all(
            color: Colors.black,
            width: 1.5,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              '🦭',
              style: TextStyle(fontSize: 14, color: Colors.black),
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: GoogleFonts.inter(
                color: Colors.black,
                fontSize: 13,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.2,
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              PhosphorIcons.caretRight(PhosphorIconsStyle.bold),
              size: 13,
              color: Colors.black,
            ),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: () {
        if (rec != null) {
          showWalrusMemorySheet(
            context: context,
            isSaved: isSaved,
            queryUsed: rec.queryUsed,
            moodAngle: rec.moodAngle ?? 'Situational Resonance',
            memories: rec.recalledMemories.isNotEmpty
                ? rec.recalledMemories
                : [
                    {
                      'category': 'Taste Anchor',
                      'text': memoryText,
                      'namespace': 'core'
                    }
                  ],
            attributedMemory: rec.attributedMemory ?? memoryText,
            mediaTitle: rec.title,
            category: rec.mediaType.name,
          );
        } else {
          showWalrusMemorySheet(
            context: context,
            isSaved: isSaved,
            activeMemories: [memoryText],
            category: 'session',
          );
        }
      },
      behavior: HitTestBehavior.opaque,
      child: Opacity(
        opacity: 0,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(50),
            border: Border.all(
              color: Colors.black,
              width: 1.5,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🦭', style: TextStyle(fontSize: 14)),
              const SizedBox(width: 8),
              Text(
                label,
                style: GoogleFonts.inter(
                  color: Colors.black,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.2,
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                PhosphorIcons.caretRight(PhosphorIconsStyle.bold),
                size: 13,
                color: Colors.black,
              ),
            ],
          ),
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
    required this.isRecording,
    this.onPointerDown,
    this.onPointerUp,
    this.onPointerCancel,
  });

  final bool isKnockoutLayer;
  final TextEditingController chatController;
  final FocusNode chatFocusNode;
  final VoidCallback onSend;
  final bool isRecording;
  final void Function(PointerDownEvent)? onPointerDown;
  final void Function(PointerUpEvent)? onPointerUp;
  final void Function(PointerCancelEvent)? onPointerCancel;

  @override
  Widget build(BuildContext context) {
    final keyboardHeight = MediaQuery.of(context).viewInsets.bottom;
    final isKeyboardOpen = keyboardHeight > 0;
    final safeBottom = MediaQuery.of(context).padding.bottom;

    final bottomPadding = isKeyboardOpen
        ? keyboardHeight + 16.0
        : safeBottom + 83.0;

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        bottom: bottomPadding,
        top: 8,
      ),
      child: Listener(
        behavior: HitTestBehavior.opaque,
        onPointerDown: isKnockoutLayer ? null : onPointerDown,
        onPointerUp: isKnockoutLayer ? null : onPointerUp,
        onPointerCancel: isKnockoutLayer ? null : onPointerCancel,
        child: SizedBox(
          height: 51,
          width: double.infinity,
          child: isRecording
              ? Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _SineWaveVisualizer(isKnockoutLayer: isKnockoutLayer),
                )
              : Container(
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
                            child: IgnorePointer(
                              ignoring: isKnockoutLayer || !chatFocusNode.hasFocus,
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
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Animated waving sine wave visualizer widget
// ═══════════════════════════════════════════════════════════════════════
class _SineWaveVisualizer extends StatefulWidget {
  const _SineWaveVisualizer({
    required this.isKnockoutLayer,
  });

  final bool isKnockoutLayer;

  @override
  State<_SineWaveVisualizer> createState() => _SineWaveVisualizerState();
}

class _SineWaveVisualizerState extends State<_SineWaveVisualizer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    if (widget.isKnockoutLayer) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isKnockoutLayer) {
      // Visible layer: just a transparent container to receive touch/events
      return Container(
        height: 51,
        color: Colors.transparent,
      );
    }

    // Knockout layer: paint the moving sine wave in black (BlendMode.srcOut subtracts it)
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final phase = _controller.value * 2.0 * math.pi;
        return CustomPaint(
          size: const Size(double.infinity, 51),
          painter: _SineWavePainter(
            phase: phase,
            color: Colors.black,
            strokeWidth: 6.0,
          ),
        );
      },
    );
  }
}

class _SineWavePainter extends CustomPainter {
  final double phase;
  final Color color;
  final double strokeWidth;

  _SineWavePainter({
    required this.phase,
    required this.color,
    this.strokeWidth = 6.0,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    final path = Path();
    final midY = size.height / 2;
    final width = size.width;

    // Inset start and end to prevent the round caps from being clipped by the canvas boundary
    final margin = strokeWidth / 2;
    final drawWidth = width - (margin * 2);

    // 3 peaks (3 full cycles) across the drawn width
    final double frequency = (3.0 * 2.0 * math.pi) / drawWidth;
    final double maxAmplitude = 15.0;

    for (double x = 0.0; x <= drawWidth; x += 1.0) {
      final double actualX = x + margin;
      // Sine/Hann window to damp amplitude to 0 at edges
      final double envelope = math.sin(math.pi * x / drawWidth);
      final double y = midY + maxAmplitude * envelope * math.sin(frequency * x - phase);
      if (x == 0.0) {
        path.moveTo(actualX, y);
      } else {
        path.lineTo(actualX, y);
      }
    }

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _SineWavePainter oldDelegate) {
    return oldDelegate.phase != phase ||
        oldDelegate.color != color ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}
