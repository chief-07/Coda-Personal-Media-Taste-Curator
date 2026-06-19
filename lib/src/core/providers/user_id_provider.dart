import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';

final userIdProvider = Provider<String>((ref) {
  final prefs = ref.watch(sharedPreferencesProvider);
  const key = 'coda_user_id';
  
  String? userId = prefs.getString(key);
  if (userId == null) {
    // Generate a pseudo-random UUID-like string
    final random = Random();
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final randomPart = List.generate(8, (_) => random.nextInt(16).toRadixString(16)).join('');
    userId = 'user_${timestamp}_$randomPart';
    prefs.setString(key, userId);
  }
  
  return userId;
});
