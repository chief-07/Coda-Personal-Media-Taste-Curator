import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:coda/src/features/onboarding/data/coda_ai_service.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';

class ChatMessage {
  final String? text;
  final List<String>? chips;
  final bool isUser;

  ChatMessage({
    this.text,
    this.chips,
    required this.isUser,
  }) : assert(text != null || chips != null);
}

class OnboardingState {
  final List<ChatMessage> messages;
  final bool isLoading;

  OnboardingState({
    required this.messages,
    required this.isLoading,
  });

  OnboardingState copyWith({
    List<ChatMessage>? messages,
    bool? isLoading,
  }) {
    return OnboardingState(
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class OnboardingController extends Notifier<OnboardingState> {
  final _aiService = CodaAiService();

  @override
  OnboardingState build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    final savedChips = prefs.getStringList('coda_onboarding_chips');
    if (savedChips != null && savedChips.isNotEmpty) {
      return OnboardingState(
        messages: [
          ChatMessage(chips: savedChips, isUser: false),
        ],
        isLoading: false,
      );
    }
    return OnboardingState(
      messages: [],
      isLoading: false,
    );
  }

  void reset() {
    state = OnboardingState(
      messages: [],
      isLoading: false,
    );
  }

  Future<void> sendMessage(String text) async {
    if (text.isEmpty) return;

    // Get currently extracted chips before adding the new message
    final lastChipsMessage = state.messages.reversed.firstWhere(
      (m) => m.chips != null,
      orElse: () => ChatMessage(chips: [], isUser: false),
    );
    final currentChips = lastChipsMessage.chips ?? [];

    // Add user's message to the chat history
    final updatedMessages = List<ChatMessage>.from(state.messages)
      ..add(ChatMessage(text: text, isUser: true));

    state = state.copyWith(
      messages: updatedMessages,
      isLoading: true,
    );

    try {
      final response = await _aiService.processUserMessage(
        text,
        currentChips,
        updatedMessages.sublist(0, updatedMessages.length - 1), // pass previous history
      );

      final prefs = ref.read(sharedPreferencesProvider);

      if (response.memoryUpdates != null) {
        await ref.read(livingMemoryProvider.notifier).applyUpdates(response.memoryUpdates!);
        ref.read(homeRecommendationProvider.notifier).reload();
      }

      if (response.message != null) {
        final withCodaResponse = List<ChatMessage>.from(state.messages)
          ..add(ChatMessage(
            text: response.message,
            chips: response.status == 'success' ? response.chips : null,
            isUser: false,
          ));

        state = state.copyWith(
          messages: withCodaResponse,
          isLoading: false,
        );

        if (response.status == 'success' && response.chips != null) {
          await prefs.setStringList('coda_onboarding_chips', response.chips!);
        }
      } else if (response.chips != null) {
        final withCodaResponse = List<ChatMessage>.from(state.messages)
          ..add(ChatMessage(
            chips: response.chips,
            isUser: false,
          ));

        state = state.copyWith(
          messages: withCodaResponse,
          isLoading: false,
        );

        await prefs.setStringList('coda_onboarding_chips', response.chips!);
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (e) {
      print('OnboardingController error: $e');
      state = state.copyWith(isLoading: false);
    }
  }
}

final onboardingControllerProvider =
    NotifierProvider<OnboardingController, OnboardingState>(
  OnboardingController.new,
);
