import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';
import 'package:coda/src/features/session/application/archived_sessions_controller.dart';
import 'package:coda/src/features/session/domain/archived_session.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/recommendation/data/recommendation_service.dart';

class SessionChatState {
  final List<ChatMessage> messages;
  final bool isLoading;

  SessionChatState({
    required this.messages,
    required this.isLoading,
  });

  SessionChatState copyWith({
    List<ChatMessage>? messages,
    bool? isLoading,
  }) {
    return SessionChatState(
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class SessionChatController extends Notifier<SessionChatState> {
  SessionChatController(this.sessionId);

  final String sessionId;
  bool _isLoading = false;

  @override
  SessionChatState build() {
    final sessions = ref.watch(archivedSessionsProvider);
    final session = sessions.firstWhere(
      (s) => s.id == sessionId,
      orElse: () => ArchivedSession(
        id: sessionId,
        title: '',
        mediaType: 'movie',
        posterUrl: '',
        oneLineSummary: '',
        chatHistory: [],
        archivedAt: DateTime.now(),
      ),
    );
    return SessionChatState(
      messages: session.chatHistory,
      isLoading: _isLoading,
    );
  }

  Future<void> sendMessage(String text) async {
    final sessions = ref.read(archivedSessionsProvider);
    final session = sessions.firstWhere(
      (s) => s.id == sessionId,
      orElse: () => ArchivedSession(
        id: sessionId,
        title: '',
        mediaType: 'movie',
        posterUrl: '',
        oneLineSummary: '',
        chatHistory: [],
        archivedAt: DateTime.now(),
      ),
    );

    if (session.title.isEmpty || text.trim().isEmpty) return;

    final userMsg = ChatMessage(text: text, isUser: true);
    final updatedHistory = [...session.chatHistory, userMsg];

    // Persist immediately in local history
    final updatedSession = ArchivedSession(
      id: session.id,
      title: session.title,
      mediaType: session.mediaType,
      posterUrl: session.posterUrl,
      oneLineSummary: session.oneLineSummary,
      chatHistory: updatedHistory,
      archivedAt: session.archivedAt,
    );
    await ref.read(archivedSessionsProvider.notifier).archiveOrUpdateSession(updatedSession);

    _isLoading = true;
    state = SessionChatState(messages: updatedHistory, isLoading: true);

    try {
      final memory = ref.read(livingMemoryProvider);
      
      // format chat history (excluding the user's latest message)
      final historyPayload = updatedHistory
          .sublist(0, updatedHistory.length - 1)
          .map((m) => {
                'isUser': m.isUser,
                'text': m.text ?? '',
              })
          .toList();

      final service = ref.read(recommendationServiceProvider);
      final discussResult = await service.discussRecommendationWithRefinements(
        memory: memory,
        title: session.title,
        mediaType: session.mediaType,
        codaBlurb: '',
        pitchParagraphs: [],
        chatHistory: historyPayload,
        userMessage: text,
      );

      // Apply memory updates dynamically if harvested
      if (discussResult.memoryUpdates != null) {
        await ref.read(livingMemoryProvider.notifier).applyUpdates(discussResult.memoryUpdates!);
        ref.read(homeRecommendationProvider.notifier).reload();
      }

      final codaReply = ChatMessage(text: discussResult.message, isUser: false);
      final finalSession = ArchivedSession(
        id: session.id,
        title: session.title,
        mediaType: session.mediaType,
        posterUrl: session.posterUrl,
        oneLineSummary: discussResult.oneLineSummary ?? session.oneLineSummary,
        chatHistory: [...updatedHistory, codaReply],
        archivedAt: session.archivedAt,
      );
      await ref.read(archivedSessionsProvider.notifier).archiveOrUpdateSession(finalSession);
    } catch (e) {
      print('SessionChatController error: $e');
      final errorReply = ChatMessage(
        text: "Sorry, I had trouble connecting. Can we try again?",
        isUser: false,
      );
      final finalSession = ArchivedSession(
        id: session.id,
        title: session.title,
        mediaType: session.mediaType,
        posterUrl: session.posterUrl,
        oneLineSummary: session.oneLineSummary,
        chatHistory: [...updatedHistory, errorReply],
        archivedAt: session.archivedAt,
      );
      await ref.read(archivedSessionsProvider.notifier).archiveOrUpdateSession(finalSession);
    } finally {
      _isLoading = false;
      // build will trigger automatically due to archivedSessionsProvider updates
    }
  }
}

final sessionChatControllerProvider =
    NotifierProvider.family<SessionChatController, SessionChatState, String>(
  SessionChatController.new,
);
