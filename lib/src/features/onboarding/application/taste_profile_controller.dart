import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';
import 'package:coda/src/features/onboarding/data/coda_ai_service.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';

class TasteProfileTabState {
  final List<ChatMessage> messages;
  final bool showButtons;
  final bool isLoading;

  TasteProfileTabState({
    required this.messages,
    required this.showButtons,
    required this.isLoading,
  });

  TasteProfileTabState copyWith({
    List<ChatMessage>? messages,
    bool? showButtons,
    bool? isLoading,
  }) {
    return TasteProfileTabState(
      messages: messages ?? this.messages,
      showButtons: showButtons ?? this.showButtons,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class TasteProfileState {
  final Map<String, TasteProfileTabState> tabs;

  TasteProfileState({required this.tabs});

  TasteProfileState copyWith({Map<String, TasteProfileTabState>? tabs}) {
    return TasteProfileState(
      tabs: tabs ?? this.tabs,
    );
  }
}

class TasteProfileController extends Notifier<TasteProfileState> {
  CodaAiService get _aiService => ref.read(codaAiServiceProvider);

  @override
  TasteProfileState build() {
    // Watch onboardingControllerProvider to get initial chips list reactively
    final onboardingState = ref.watch(onboardingControllerProvider);
    final lastChipsMessage = onboardingState.messages.reversed.firstWhere(
      (m) => m.chips != null,
      orElse: () => ChatMessage(chips: [], isUser: false),
    );
    final chips = lastChipsMessage.chips ?? [];
    final tabsList = ['You', ...chips];

    final tabsMap = <String, TasteProfileTabState>{};
    for (final tab in tabsList) {
      tabsMap[tab.toLowerCase()] = _getInitialStateForTab(tab);
    }

    return TasteProfileState(tabs: tabsMap);
  }

  TasteProfileTabState getTabState(String tab) {
    final cleanTab = tab.toLowerCase();
    return state.tabs[cleanTab] ?? _getInitialStateForTab(tab);
  }

  Future<void> sendMessage(String tab, String text) async {
    if (text.isEmpty) return;

    final cleanTab = tab.toLowerCase();
    final currentTabState = getTabState(tab);

    final onboardingState = ref.read(onboardingControllerProvider);
    final lastChipsMessage = onboardingState.messages.reversed.firstWhere(
      (m) => m.chips != null,
      orElse: () => ChatMessage(chips: [], isUser: false),
    );
    final chips = lastChipsMessage.chips ?? [];
    final tabsList = ['You', ...chips];
    final isLastTab = cleanTab == tabsList.last.toLowerCase();

    // Add user's message to history
    final updatedMessages = List<ChatMessage>.from(currentTabState.messages)
      ..add(ChatMessage(text: text, isUser: true));

    final loadingTabState = currentTabState.copyWith(
      messages: updatedMessages,
      isLoading: true,
    );

    state = state.copyWith(
      tabs: Map<String, TasteProfileTabState>.from(state.tabs)..[cleanTab] = loadingTabState,
    );

    try {
      final response = await _aiService.processTasteProfileMessage(
        userMessage: text,
        tabName: tab,
        isLastTab: isLastTab,
        chatHistory: currentTabState.messages, // pass current history
        selectedCategories: chips,
      );

      final nextTabState = getTabState(tab);

      if (response.memoryUpdates != null) {
        await ref.read(livingMemoryProvider.notifier).applyUpdates(response.memoryUpdates!);
        ref.read(homeRecommendationProvider.notifier).refreshOnboardingPreview();
      }

      if (response.status == 'success' && response.message != null) {
        final showBtn = response.showButtons ?? false;
        final withCodaResponse = List<ChatMessage>.from(nextTabState.messages)
          ..add(ChatMessage(
            text: response.message,
            isUser: false,
            memoryUpdates: response.memoryUpdates,
          ));

        final updatedTabState = nextTabState.copyWith(
          messages: withCodaResponse,
          showButtons: showBtn,
          isLoading: false,
        );

        state = state.copyWith(
          tabs: Map<String, TasteProfileTabState>.from(state.tabs)..[cleanTab] = updatedTabState,
        );
      } else if (response.status == 'need_more' && response.message != null) {
        final withCodaResponse = List<ChatMessage>.from(nextTabState.messages)
          ..add(ChatMessage(
            text: response.message,
            isUser: false,
            memoryUpdates: response.memoryUpdates,
          ));

        final updatedTabState = nextTabState.copyWith(
          messages: withCodaResponse,
          isLoading: false,
        );

        state = state.copyWith(
          tabs: Map<String, TasteProfileTabState>.from(state.tabs)..[cleanTab] = updatedTabState,
        );
      } else {
        final updatedTabState = nextTabState.copyWith(isLoading: false);
        state = state.copyWith(
          tabs: Map<String, TasteProfileTabState>.from(state.tabs)..[cleanTab] = updatedTabState,
        );
      }
    } catch (e) {
      print('TasteProfileController error: $e');
      final nextTabState = getTabState(tab);
      final withErrResponse = List<ChatMessage>.from(nextTabState.messages)
        ..add(ChatMessage(text: "[Debug Error (TasteProfile Controller)]: $e", isUser: false));
      final updatedTabState = nextTabState.copyWith(
        messages: withErrResponse,
        isLoading: false,
      );
      state = state.copyWith(
        tabs: Map<String, TasteProfileTabState>.from(state.tabs)..[cleanTab] = updatedTabState,
      );
    }
  }

  TasteProfileTabState _getInitialStateForTab(String tab) {
    final tabName = tab.toLowerCase();
    
    String codaGreeting;
    
    if (tabName == 'you') {
      codaGreeting = "Tell me about you. What moves you? What kind of stories are you always drawn to? Tell me whatever comes to mind — or just say hello.";
    } else {
      codaGreeting = "Tell me about your taste in $tab. The stories you love, specific titles that stayed with you, or what you're craving right now.";
    }

    return TasteProfileTabState(
      messages: [
        ChatMessage(text: codaGreeting, isUser: false),
      ],
      showButtons: false,
      isLoading: false,
    );
  }

  Future<void> harmonizeTabMemory(String tab) async {
    final cleanTab = tab.toLowerCase();
    final currentTabState = getTabState(tab);

    final loadingTabState = currentTabState.copyWith(isLoading: true);
    state = state.copyWith(
      tabs: Map<String, TasteProfileTabState>.from(state.tabs)..[cleanTab] = loadingTabState,
    );

    final currentMemory = ref.read(livingMemoryProvider);
    final updates = await _aiService.harmonizeTabMemory(
      chatHistory: currentTabState.messages,
      currentMemory: currentMemory,
      tabName: tab,
    );

    if (updates != null) {
      // Apply the harmonized updates directly (overwriting/cleaning the memory)
      await ref.read(livingMemoryProvider.notifier).applyUpdates(updates);
      ref.read(homeRecommendationProvider.notifier).reload();
    }

    final nextTabState = getTabState(tab);
    final updatedTabState = nextTabState.copyWith(isLoading: false);
    state = state.copyWith(
      tabs: Map<String, TasteProfileTabState>.from(state.tabs)..[cleanTab] = updatedTabState,
    );
  }

  Future<void> harmonizeAllMemory() async {
    final currentMemory = ref.read(livingMemoryProvider);
    final updates = await _aiService.harmonizeAllMemory(currentMemory);
    if (updates != null) {
      await ref.read(livingMemoryProvider.notifier).applyUpdates(updates);
      ref.read(homeRecommendationProvider.notifier).reload();
    }
  }
}

final tasteProfileControllerProvider =
    NotifierProvider<TasteProfileController, TasteProfileState>(
  TasteProfileController.new,
);
