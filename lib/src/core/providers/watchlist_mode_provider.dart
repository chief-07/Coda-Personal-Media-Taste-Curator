import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';

class WatchlistModeNotifier extends StateNotifier<bool> {
  WatchlistModeNotifier(this.ref) : super(false) {
    _init();
  }

  final Ref ref;
  static const _key = 'watchlist_mode_enabled';

  void _init() {
    final prefs = ref.read(sharedPreferencesProvider);
    state = prefs.getBool(_key) ?? false;
  }

  Future<void> toggle() async {
    final prefs = ref.read(sharedPreferencesProvider);
    final newState = !state;
    await prefs.setBool(_key, newState);
    state = newState;
  }
}

final watchlistModeProvider = StateNotifierProvider<WatchlistModeNotifier, bool>((ref) {
  return WatchlistModeNotifier(ref);
});
