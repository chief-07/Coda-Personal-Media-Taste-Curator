import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';

class UserIdNotifier extends Notifier<String> {
  static const _key = 'coda_user_id';
  static const _accountsListKey = 'coda_accounts_list';
  static const _creatingNewAccountKey = 'coda_creating_new_account';
  static const _previousAccountIdKey = 'coda_previous_account_id';
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

    final isCreatingNew = prefs.getBool(_creatingNewAccountKey) == true;
    final accounts = List<String>.from(prefs.getStringList(_accountsListKey) ?? []);
    if (!isCreatingNew && !accounts.contains(userId)) {
      accounts.add(userId);
      prefs.setStringList(_accountsListKey, accounts);
    }

    return userId;
  }

  List<String> getAccounts() {
    final prefs = ref.read(sharedPreferencesProvider);
    final isCreatingNew = prefs.getBool(_creatingNewAccountKey) == true;
    final accounts = List<String>.from(prefs.getStringList(_accountsListKey) ?? []);
    if (!isCreatingNew && !accounts.contains(state)) {
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

  Future<void> _saveValueByType(
    SharedPreferences prefs,
    String sourceKey,
    String targetKey,
  ) async {
    try {
      final Object? val = prefs.get(sourceKey);
      if (val == null) {
        await prefs.remove(targetKey);
      } else if (val is String) {
        await prefs.setString(targetKey, val);
      } else if (val is bool) {
        await prefs.setBool(targetKey, val);
      } else if (val is int) {
        await prefs.setInt(targetKey, val);
      } else if (val is double) {
        await prefs.setDouble(targetKey, val);
      } else if (val is List) {
        await prefs.setStringList(
          targetKey,
          val.map((e) => e.toString()).toList(),
        );
      }
    } catch (_) {}
  }

  Future<void> _saveAccountSnapshot(
    SharedPreferences prefs,
    String accountId,
  ) async {
    Future<void> saveKey(String key) =>
        _saveValueByType(prefs, key, 'acct_${accountId}_$key');

    await saveKey('living_memory_v1');
    await saveKey('coda_selected_media_type');
    await saveKey('coda_active_session_recommendation');
    await saveKey('coda_onboarding_chips');
    await saveKey('coda_archived_sessions_v1');
    await saveKey('coda_onboarding_completed');

    final allTypes = _collectAllTypeNames(prefs, accountId);
    for (final type in allTypes) {
      await saveKey('coda_active_pick_$type');
      await saveKey('coda_buffer_pick_$type');
      await saveKey('coda_recommendation_queue_$type');
    }
  }

  Future<void> _restoreAccountSnapshot(
    SharedPreferences prefs,
    String accountId,
  ) async {
    Future<void> restoreKey(String key) =>
        _saveValueByType(prefs, 'acct_${accountId}_$key', key);

    final allTypes = _collectAllTypeNames(prefs, accountId);
    await restoreKey('living_memory_v1');
    await restoreKey('coda_selected_media_type');
    await restoreKey('coda_active_session_recommendation');
    await restoreKey('coda_onboarding_chips');
    await restoreKey('coda_archived_sessions_v1');
    await restoreKey('coda_onboarding_completed');

    for (final type in allTypes) {
      await restoreKey('coda_active_pick_$type');
      await restoreKey('coda_buffer_pick_$type');
      await restoreKey('coda_recommendation_queue_$type');
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

  /// Begins creating a new account: snapshots the current account, enters
  /// new-account onboarding mode (so the user can press Back to return to
  /// their previous account), and only commits the new account to the accounts
  /// list once onboarding completes.
  Future<String> createNewAccount() async {
    final prefs = ref.read(sharedPreferencesProvider);
    final currentId = state;

    // 1. Record previous account ID & mark that we are in new-account onboarding immediately
    await prefs.setString(_previousAccountIdKey, currentId);
    await prefs.setBool(_creatingNewAccountKey, true);

    // 2. Snapshot the current account before leaving it
    await _saveAccountSnapshot(prefs, currentId);

    // 3. Ensure the current account is recorded in the accounts list
    final accounts = List<String>.from(prefs.getStringList(_accountsListKey) ?? []);
    if (!accounts.contains(currentId)) {
      accounts.add(currentId);
      await prefs.setStringList(_accountsListKey, accounts);
    }

    // 4. Generate the new account ID & clear working state for fresh onboarding
    final random = Random();
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final randomPart =
        List.generate(8, (_) => random.nextInt(16).toRadixString(16)).join('');
    final newId = 'user_${timestamp}_$randomPart';

    await _clearWorkingStateForNewAccount(prefs);
    await prefs.setString(_key, newId);
    state = newId;
    return newId;
  }

  /// Cancels new-account onboarding and restores the previous account untouched.
  Future<void> cancelNewAccountCreation() async {
    final prefs = ref.read(sharedPreferencesProvider);
    final prevId = prefs.getString(_previousAccountIdKey);
    final unfinishedId = state;

    await prefs.remove(_creatingNewAccountKey);
    await prefs.remove(_previousAccountIdKey);

    final accounts = List<String>.from(prefs.getStringList(_accountsListKey) ?? []);
    accounts.remove(unfinishedId);

    if (prevId != null && prevId.isNotEmpty) {
      if (!accounts.contains(prevId)) {
        accounts.add(prevId);
      }
      await prefs.setStringList(_accountsListKey, accounts);
      await _restoreAccountSnapshot(prefs, prevId);
      await prefs.setString(_key, prevId);
      state = prevId;
    }
  }

  /// Commits the newly onboarded account into the saved accounts list.
  Future<void> completeNewAccountOnboarding() async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.remove(_creatingNewAccountKey);
    await prefs.remove(_previousAccountIdKey);

    final accounts = List<String>.from(prefs.getStringList(_accountsListKey) ?? []);
    if (!accounts.contains(state)) {
      accounts.add(state);
      await prefs.setStringList(_accountsListKey, accounts);
    }
    await _saveAccountSnapshot(prefs, state);
    // Notify listeners that the committed accounts list updated
    state = state;
  }

  /// Switches to an existing account, saving the current account's snapshot
  /// and restoring the target account's snapshot.
  /// Returns true if the target account has already completed onboarding.
  Future<bool> switchToAccount(String targetUserId) async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.remove(_creatingNewAccountKey);
    await prefs.remove(_previousAccountIdKey);

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
  final isCreatingNew = prefs.getBool('coda_creating_new_account') == true;
  final accounts =
      List<String>.from(prefs.getStringList('coda_accounts_list') ?? []);
  if (!isCreatingNew && !accounts.contains(activeId)) {
    accounts.add(activeId);
  }
  return accounts;
});
