import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:coda/src/features/session/domain/archived_session.dart';

class ArchivedSessionsNotifier extends Notifier<List<ArchivedSession>> {
  static const _key = 'coda_archived_sessions_v1';

  @override
  List<ArchivedSession> build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    final list = prefs.getStringList(_key);
    if (list == null) return [];
    try {
      return list.map((e) => ArchivedSession.fromJson(jsonDecode(e))).toList();
    } catch (e) {
      print('Error parsing archived sessions: $e');
      return [];
    }
  }

  Future<void> saveSessions(List<ArchivedSession> sessions) async {
    final prefs = ref.read(sharedPreferencesProvider);
    final stringList = sessions.map((e) => jsonEncode(e.toJson())).toList();
    await prefs.setStringList(_key, stringList);
    state = sessions;
  }

  Future<void> archiveOrUpdateSession(ArchivedSession session) async {
    final list = List<ArchivedSession>.from(state);
    final index = list.indexWhere((element) => element.id == session.id);
    if (index >= 0) {
      list[index] = session;
    } else {
      list.insert(0, session);
    }
    await saveSessions(list);
  }

  Future<void> deleteSession(String id) async {
    final list = List<ArchivedSession>.from(state);
    list.removeWhere((element) => element.id == id);
    await saveSessions(list);
  }
}

final archivedSessionsProvider = NotifierProvider<ArchivedSessionsNotifier, List<ArchivedSession>>(
  ArchivedSessionsNotifier.new,
);
