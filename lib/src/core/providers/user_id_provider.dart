import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';

class UserIdNotifier extends Notifier<String> {
  static const _key = 'coda_user_id';
  static const _accountsListKey = 'coda_accounts_list';
  static const _defaultMediaTypes = [
    'anime',
    'movie',
    'tv',
    'visualNovel',
    'manga',
    'book',
    'game',
    'youtube',
    'music',
  ];

  @override
  String build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    String? userId = prefs.getString(_key);
    if (userId == null) {
      final random = Random();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final randomPart =
          List.generate(8, (_) => random.nextInt(16).toRadixString(16)).join('');
      userId = 'user_${timestamp}_$randomPart';
      prefs.setString(_key, userId);
    }

    final accounts = List<String>.from(prefs.getStringList(_accountsListKey) ?? []);
    if (!accounts.contains(userId)) {
      accounts.add(userId);
      prefs.setStringList(_accountsListKey, accounts);
    }

    return userId;
  }

  List<String> getAccounts() {
    final prefs = ref.read(sharedPreferencesProvider);
    final accounts = List<String>.from(prefs.getStringList(_accountsListKey) ?? []);
    if (!accounts.contains(state)) {
      accounts.add(state);
    }
    return accounts;
  }

  Set<String> _collectAllTypeNames(SharedPreferences prefs, String accountId) {
    final types = <String>{..._defaultMediaTypes};
    final activeChips = prefs.getStringList('coda_onboarding_chips') ?? [];
    final snapChips =
        prefs.getStringList('acct_${accountId}_coda_onboarding_chips') ?? [];
    for (final chip in [...activeChips, ...snapChips]) {
      types.add(chip);
      types.add(chip.toLowerCase());
    }
    return types;
  }

  Future<void> _saveAccountSnapshot(
    SharedPreferences prefs,
    String accountId,
  ) async {
    Future<void> saveStr(String key) async {
      final val = prefs.getString(key);
      final snapKey = 'acct_${accountId}_$key';
      if (val != null) {
        await prefs.setString(snapKey, val);
      } else {
        await prefs.remove(snapKey);
      }
    }

    Future<void> saveStrList(String key) async {
      final val = prefs.getStringList(key);
      final snapKey = 'acct_${accountId}_$key';
      if (val != null) {
        await prefs.setStringList(snapKey, val);
      } else {
        await prefs.remove(snapKey);
      }
    }

    Future<void> saveBool(String key) async {
      final val = prefs.getBool(key);
      final snapKey = 'acct_${accountId}_$key';
      if (val != null) {
        await prefs.setBool(snapKey, val);
      } else {
        await prefs.remove(snapKey);
      }
    }

    await saveStr('living_memory_v1');
    await saveStr('coda_selected_media_type');
    await saveStr('coda_active_session_recommendation');
    await saveStrList('coda_onboarding_chips');
    await saveStrList('coda_archived_sessions_v1');
    await saveBool('coda_onboarding_completed');

    final allTypes = _collectAllTypeNames(prefs, accountId);
    for (final type in allTypes) {
      await saveStr('coda_active_pick_$type');
      await saveStr('coda_buffer_pick_$type');
      await saveStrList('coda_recommendation_queue_$type');
    }
  }

  Future<void> _restoreAccountSnapshot(
    SharedPreferences prefs,
    String accountId,
  ) async {
    Future<void> restoreStr(String key) async {
      final snapVal = prefs.getString('acct_${accountId}_$key');
      if (snapVal != null) {
        await prefs.setString(key, snapVal);
      } else {
        await prefs.remove(key);
      }
    }

    Future<void> restoreStrList(String key) async {
      final snapVal = prefs.getStringList('acct_${accountId}_$key');
      if (snapVal != null) {
        await prefs.setStringList(key, snapVal);
      } else {
        await prefs.remove(key);
      }
    }

    Future<void> restoreBool(String key) async {
      final snapVal = prefs.getBool('acct_${accountId}_$key');
      if (snapVal != null) {
        await prefs.setBool(key, snapVal);
      } else {
        await prefs.remove(key);
      }
    }

    final allTypes = _collectAllTypeNames(prefs, accountId);
    await restoreStr('living_memory_v1');
    await restoreStr('coda_selected_media_type');
    await restoreStr('coda_active_session_recommendation');
    await restoreStrList('coda_onboarding_chips');
    await restoreStrList('coda_archived_sessions_v1');
    await restoreBool('coda_onboarding_completed');

    for (final type in allTypes) {
      await restoreStr('coda_active_pick_$type');
      await restoreStr('coda_buffer_pick_$type');
      await restoreStrList('coda_recommendation_queue_$type');
    }
  }

  Future<void> _clearWorkingStateForNewAccount(SharedPreferences prefs) async {
    final allTypes = _collectAllTypeNames(prefs, state);
    await prefs.remove('living_memory_v1');
    await prefs.remove('coda_onboarding_chips');
    await prefs.remove('coda_selected_media_type');
    await prefs.remove('coda_onboarding_completed');
    await prefs.remove('coda_active_session_recommendation');
    await prefs.remove('coda_archived_sessions_v1');
    for (final type in allTypes) {
      await prefs.remove('coda_active_pick_$type');
      await prefs.remove('coda_buffer_pick_$type');
      await prefs.remove('coda_recommendation_queue_$type');
    }
  }

  /// Creates a new account while preserving the previous account's snapshot
  /// in the accounts list so the user can cycle between them anytime.
  Future<String> createNewAccount() async {
    final prefs = ref.read(sharedPreferencesProvider);
    final currentId = state;

    // 1. Snapshot the current account before switching away
    await _saveAccountSnapshot(prefs, currentId);

    // 2. Generate the new account ID
    final random = Random();
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final randomPart =
        List.generate(8, (_) => random.nextInt(16).toRadixString(16)).join('');
    final newId = 'user_${timestamp}_$randomPart';

    // 3. Persist both old and new accounts in the accounts list
    final accounts = List<String>.from(prefs.getStringList(_accountsListKey) ?? []);
    if (!accounts.contains(currentId)) {
      accounts.add(currentId);
    }
    accounts.add(newId);
    await prefs.setStringList(_accountsListKey, accounts);

    // 4. Clear active working state for the fresh account & set newId active
    await _clearWorkingStateForNewAccount(prefs);
    await prefs.setString(_key, newId);
    state = newId;
    return newId;
  }

  /// Switches to an existing account, saving the current account's snapshot
  /// and restoring the target account's snapshot.
  /// Returns true if the target account has already completed onboarding.
  Future<bool> switchToAccount(String targetUserId) async {
    final prefs = ref.read(sharedPreferencesProvider);
    if (targetUserId == state) {
      return prefs.getBool('coda_onboarding_completed') == true;
    }

    // 1. Save current account state
    await _saveAccountSnapshot(prefs, state);

    // 2. Restore target account state
    await _restoreAccountSnapshot(prefs, targetUserId);

    // 3. Ensure both are in the accounts list and update active userId
    final accounts = List<String>.from(prefs.getStringList(_accountsListKey) ?? []);
    if (!accounts.contains(state)) accounts.add(state);
    if (!accounts.contains(targetUserId)) accounts.add(targetUserId);
    await prefs.setStringList(_accountsListKey, accounts);

    await prefs.setString(_key, targetUserId);
    state = targetUserId;

    return prefs.getBool('coda_onboarding_completed') == true;
  }

  /// Cycles to the next account in the saved accounts list.
  /// Returns true if the newly active account has completed onboarding.
  Future<bool> cycleNextAccount() async {
    final accounts = getAccounts();
    if (accounts.length <= 1) {
      final prefs = ref.read(sharedPreferencesProvider);
      return prefs.getBool('coda_onboarding_completed') == true;
    }
    final currentIndex = accounts.indexOf(state);
    final nextIndex = (currentIndex + 1) % accounts.length;
    return switchToAccount(accounts[nextIndex]);
  }
}

final userIdProvider = NotifierProvider<UserIdNotifier, String>(() {
  return UserIdNotifier();
});

final userAccountsListProvider = Provider<List<String>>((ref) {
  final activeId = ref.watch(userIdProvider);
  final prefs = ref.watch(sharedPreferencesProvider);
  final accounts =
      List<String>.from(prefs.getStringList('coda_accounts_list') ?? []);
  if (!accounts.contains(activeId)) {
    accounts.add(activeId);
  }
  return accounts;
});
