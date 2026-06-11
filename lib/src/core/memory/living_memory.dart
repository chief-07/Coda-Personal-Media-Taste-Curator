import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/shared_preferences_provider.dart';

// --- Data Models ---

class WatchlistItem {
  final String title;
  final String mediaType;
  final List<String> tags;
  final String posterUrl;
  final String ostUrl;
  final String description;
  final String codaBlurb;
  final DateTime addedAt;

  WatchlistItem({
    required this.title,
    required this.mediaType,
    required this.tags,
    required this.posterUrl,
    required this.ostUrl,
    required this.description,
    required this.codaBlurb,
    required this.addedAt,
  });

  Map<String, dynamic> toJson() => {
        'title': title,
        'mediaType': mediaType,
        'tags': tags,
        'posterUrl': posterUrl,
        'ostUrl': ostUrl,
        'description': description,
        'codaBlurb': codaBlurb,
        'addedAt': addedAt.toIso8601String(),
      };

  factory WatchlistItem.fromJson(Map<String, dynamic> json) {
    return WatchlistItem(
      title: json['title'] as String? ?? '',
      mediaType: json['mediaType'] as String? ?? json['media_type'] as String? ?? '',
      tags: List<String>.from(json['tags'] ?? []),
      posterUrl: json['posterUrl'] as String? ?? json['poster_url'] as String? ?? '',
      ostUrl: json['ostUrl'] as String? ?? json['ost_url'] as String? ?? '',
      description: json['description'] as String? ?? '',
      codaBlurb: json['codaBlurb'] as String? ?? json['coda_blurb'] as String? ?? '',
      addedAt: json['addedAt'] != null
          ? DateTime.parse(json['addedAt'] as String)
          : json['added_at'] != null
              ? DateTime.parse(json['added_at'] as String)
              : DateTime.now(),
    );
  }
}

class LivingMemory {
  final List<String> globalIdentity;
  final Map<String, List<String>> categoryProfiles;
  final String recentContext;
  final List<String> guardrails;
  final List<String> seen;
  final List<String> notForMe;
  final List<WatchlistItem> watchlist;

  LivingMemory({
    required this.globalIdentity,
    required this.categoryProfiles,
    required this.recentContext,
    required this.guardrails,
    required this.seen,
    required this.notForMe,
    required this.watchlist,
  });

  factory LivingMemory.empty() {
    return LivingMemory(
      globalIdentity: [],
      categoryProfiles: {},
      recentContext: '',
      guardrails: [],
      seen: [],
      notForMe: [],
      watchlist: [],
    );
  }

  Map<String, dynamic> toJson() => {
        'globalIdentity': globalIdentity,
        'categoryProfiles': categoryProfiles,
        'recentContext': recentContext,
        'guardrails': guardrails,
        'seen': seen,
        'notForMe': notForMe,
        'watchlist': watchlist.map((e) => e.toJson()).toList(),
      };

  factory LivingMemory.fromJson(Map<String, dynamic> json) {
    return LivingMemory(
      globalIdentity: List<String>.from(json['globalIdentity'] ?? []),
      categoryProfiles: (json['categoryProfiles'] as Map<String, dynamic>?)?.map(
            (k, e) => MapEntry(k, List<String>.from(e)),
          ) ??
          {},
      recentContext: json['recentContext'] as String? ?? '',
      guardrails: List<String>.from(json['guardrails'] ?? []),
      seen: List<String>.from(json['seen'] ?? []),
      notForMe: List<String>.from(json['notForMe'] ?? json['not_for_me'] ?? []),
      watchlist: (json['watchlist'] as List<dynamic>?)
              ?.map((e) => WatchlistItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

class MemoryUpdates {
  final List<String> globalIdentityAppends;
  final Map<String, List<String>> categoryAppends;
  final String? recentContextOverwrite;
  final List<String> guardrailsAppends;
  final List<String>? globalIdentityOverwrite;
  final Map<String, List<String>>? categoryProfilesOverwrite;
  final List<String> seenAppends;
  final List<String> notForMeAppends;
  final List<WatchlistItem> watchlistAppends;
  final List<String> watchlistRemoves;

  MemoryUpdates({
    this.globalIdentityAppends = const [],
    this.categoryAppends = const {},
    this.recentContextOverwrite,
    this.guardrailsAppends = const [],
    this.globalIdentityOverwrite,
    this.categoryProfilesOverwrite,
    this.seenAppends = const [],
    this.notForMeAppends = const [],
    this.watchlistAppends = const [],
    this.watchlistRemoves = const [],
  });

  factory MemoryUpdates.fromJson(Map<String, dynamic> json) {
    return MemoryUpdates(
      globalIdentityAppends: List<String>.from(json['global_identity_appends'] ?? []),
      categoryAppends: (json['category_appends'] as Map<String, dynamic>?)?.map(
            (k, e) => MapEntry(k, List<String>.from(e)),
          ) ?? {},
      recentContextOverwrite: json['recent_context_overwrite'] as String?,
      guardrailsAppends: List<String>.from(json['guardrails_appends'] ?? []),
      globalIdentityOverwrite: json['global_identity_overwrite'] != null
          ? List<String>.from(json['global_identity_overwrite'])
          : null,
      categoryProfilesOverwrite: (json['category_profiles_overwrite'] as Map<String, dynamic>?)?.map(
            (k, e) => MapEntry(k, List<String>.from(e)),
          ),
      seenAppends: List<String>.from(json['seen_appends'] ?? json['seen'] ?? []),
      notForMeAppends: List<String>.from(json['not_for_me_appends'] ?? json['not_for_me'] ?? []),
      watchlistAppends: (json['watchlist_appends'] as List<dynamic>?)
              ?.map((e) => WatchlistItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      watchlistRemoves: List<String>.from(json['watchlist_removes'] ?? []),
    );
  }
}

// --- Repository ---

class LivingMemoryRepository {
  final Ref ref;
  static const _key = 'living_memory_v1';

  LivingMemoryRepository(this.ref);

  LivingMemory getMemory() {
    final prefs = ref.read(sharedPreferencesProvider);
    final String? data = prefs.getString(_key);
    if (data == null) return LivingMemory.empty();
    
    try {
      return LivingMemory.fromJson(jsonDecode(data));
    } catch (e) {
      print('Error parsing LivingMemory: $e');
      return LivingMemory.empty();
    }
  }

  Future<void> saveMemory(LivingMemory memory) async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setString(_key, jsonEncode(memory.toJson()));
  }

  Future<void> applyUpdates(MemoryUpdates updates) async {
    final current = getMemory();

    // 1. Global Identity
    List<String> newGlobal;
    if (updates.globalIdentityOverwrite != null) {
      newGlobal = updates.globalIdentityOverwrite!;
    } else {
      newGlobal = List<String>.from(current.globalIdentity);
      for (var u in updates.globalIdentityAppends) {
        if (!newGlobal.contains(u)) newGlobal.add(u);
      }
    }

    // 2. Category Profiles
    final newCategory = Map<String, List<String>>.from(current.categoryProfiles);
    if (updates.categoryProfilesOverwrite != null) {
      updates.categoryProfilesOverwrite!.forEach((category, list) {
        newCategory[category] = list;
      });
    }
    
    updates.categoryAppends.forEach((category, additions) {
      if (!newCategory.containsKey(category)) {
        newCategory[category] = [];
      }
      for (var a in additions) {
        if (!newCategory[category]!.contains(a)) newCategory[category]!.add(a);
      }
    });

    // 3. Overwrite Recent Context
    final newRecent = updates.recentContextOverwrite?.isNotEmpty == true
        ? updates.recentContextOverwrite!
        : current.recentContext;

    // 4. Append Guardrails
    final newGuardrails = List<String>.from(current.guardrails);
    for (var u in updates.guardrailsAppends) {
      if (!newGuardrails.contains(u)) newGuardrails.add(u);
    }

    // 5. Append Seen Items
    final newSeen = List<String>.from(current.seen);
    for (var u in updates.seenAppends) {
      if (!newSeen.contains(u)) newSeen.add(u);
    }

    // 6. Append Not For Me Items
    final newNotForMe = List<String>.from(current.notForMe);
    for (var u in updates.notForMeAppends) {
      if (!newNotForMe.contains(u)) newNotForMe.add(u);
    }

    // 7. Watchlist Items
    final newWatchlist = List<WatchlistItem>.from(current.watchlist);
    for (var removeTitle in updates.watchlistRemoves) {
      newWatchlist.removeWhere((item) => item.title.toLowerCase() == removeTitle.toLowerCase());
    }
    for (var item in updates.watchlistAppends) {
      if (!newWatchlist.any((existing) => existing.title.toLowerCase() == item.title.toLowerCase())) {
        newWatchlist.insert(0, item);
      }
    }

    final newMemory = LivingMemory(
      globalIdentity: newGlobal,
      categoryProfiles: newCategory,
      recentContext: newRecent,
      guardrails: newGuardrails,
      seen: newSeen,
      notForMe: newNotForMe,
      watchlist: newWatchlist,
    );

    await saveMemory(newMemory);
  }
}

final livingMemoryRepositoryProvider = Provider<LivingMemoryRepository>((ref) {
  return LivingMemoryRepository(ref);
});

class LivingMemoryNotifier extends Notifier<LivingMemory> {
  @override
  LivingMemory build() {
    return ref.watch(livingMemoryRepositoryProvider).getMemory();
  }

  Future<void> applyUpdates(MemoryUpdates updates) async {
    final repo = ref.read(livingMemoryRepositoryProvider);
    await repo.applyUpdates(updates);
    state = repo.getMemory(); // refresh state to trigger UI rebuilds if needed
  }

  Future<void> seedMemory(LivingMemory memory) async {
    final repo = ref.read(livingMemoryRepositoryProvider);
    await repo.saveMemory(memory);
    state = memory;
  }

  Future<void> clearMemory() async {
    final repo = ref.read(livingMemoryRepositoryProvider);
    await repo.saveMemory(LivingMemory.empty());
    state = LivingMemory.empty();
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.remove('living_memory_v1'); // Remove key so GoRouter redirect works
    await prefs.remove('coda_onboarding_chips');
    await prefs.remove('coda_selected_media_type');
    await prefs.remove('coda_onboarding_completed');
    final types = ['anime', 'movie', 'tv', 'visualNovel', 'manga', 'book', 'game', 'youtube', 'music'];
    for (final type in types) {
      await prefs.remove('coda_active_pick_$type');
      await prefs.remove('coda_buffer_pick_$type');
      await prefs.remove('coda_recommendation_queue_$type');
    }
  }
}

final livingMemoryProvider = NotifierProvider<LivingMemoryNotifier, LivingMemory>(LivingMemoryNotifier.new);
