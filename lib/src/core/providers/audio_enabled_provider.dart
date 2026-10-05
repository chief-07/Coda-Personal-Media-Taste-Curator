import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:coda/src/features/recommendation/application/audio_player_controller.dart';

class AudioEnabledNotifier extends Notifier<bool> {
  static const _key = 'coda_audio_feature_enabled';

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
    if (!newState) {
      ref.read(audioPlayerControllerProvider.notifier).pause();
    }
  }

  Future<void> setEnabled(bool enabled) async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setBool(_key, enabled);
    state = enabled;
    if (!enabled) {
      ref.read(audioPlayerControllerProvider.notifier).pause();
    }
  }
}

final audioEnabledProvider = NotifierProvider<AudioEnabledNotifier, bool>(() {
  return AudioEnabledNotifier();
});
