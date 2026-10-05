import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';

class MemoriesModeNotifier extends Notifier<bool> {
  static const _key = 'coda_memories_mode_enabled';

  @override
  bool build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    return prefs.getBool(_key) ?? true; // Default ON
  }

  Future<void> toggle() async {
    final prefs = ref.read(sharedPreferencesProvider);
    final newState = !state;
    await prefs.setBool(_key, newState);
    state = newState;
    ref.read(homeRecommendationProvider.notifier).reloadFresh(clearAll: true);
  }

  Future<void> setEnabled(bool enabled) async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setBool(_key, enabled);
    state = enabled;
    ref.read(homeRecommendationProvider.notifier).reloadFresh(clearAll: true);
  }
}

final memoriesModeProvider = NotifierProvider<MemoriesModeNotifier, bool>(() {
  return MemoriesModeNotifier();
});
