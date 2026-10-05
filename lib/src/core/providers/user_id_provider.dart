import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';

class UserIdNotifier extends Notifier<String> {
  static const _key = 'coda_user_id';

  @override
  String build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    String? userId = prefs.getString(_key);
    if (userId == null) {
      final random = Random();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final randomPart = List.generate(8, (_) => random.nextInt(16).toRadixString(16)).join('');
      userId = 'user_${timestamp}_$randomPart';
      prefs.setString(_key, userId);
    }
    return userId;
  }

  Future<String> createNewAccount() async {
    final prefs = ref.read(sharedPreferencesProvider);
    final random = Random();
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final randomPart = List.generate(8, (_) => random.nextInt(16).toRadixString(16)).join('');
    final newId = 'user_${timestamp}_$randomPart';
    await prefs.setString(_key, newId);
    state = newId;
    return newId;
  }
}

final userIdProvider = NotifierProvider<UserIdNotifier, String>(() {
  return UserIdNotifier();
});
