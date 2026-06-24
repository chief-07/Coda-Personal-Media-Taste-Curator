import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';

class WatchlistModeNotifier extends Notifier<bool> {
  static const _key = 'watchlist_mode_enabled';

  @override
  bool build() {
    final prefs = ref.read(sharedPreferencesProvider);
    return prefs.getBool(_key) ?? false;
  }

  Future<void> toggle() async {
    final prefs = ref.read(sharedPreferencesProvider);
    final newState = !state;
    await prefs.setBool(_key, newState);
    state = newState;
  }
}

final watchlistModeProvider = NotifierProvider<WatchlistModeNotifier, bool>(() {
  return WatchlistModeNotifier();
});
