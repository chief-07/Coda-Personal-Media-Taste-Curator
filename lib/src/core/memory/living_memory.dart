import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/shared_preferences_provider.dart';

// --- Data Models ---

class LivingMemory {
  final List<String> globalIdentity;
  final Map<String, List<String>> categoryProfiles;
  final String recentContext;
  final List<String> guardrails;

  LivingMemory({
    required this.globalIdentity,
    required this.categoryProfiles,
    required this.recentContext,
    required this.guardrails,
  });

  factory LivingMemory.empty() {
    return LivingMemory(
      globalIdentity: [],
      categoryProfiles: {},
      recentContext: '',
      guardrails: [],
    );
  }

  Map<String, dynamic> toJson() => {
        'globalIdentity': globalIdentity,
        'categoryProfiles': categoryProfiles,
        'recentContext': recentContext,
        'guardrails': guardrails,
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

  MemoryUpdates({
    this.globalIdentityAppends = const [],
    this.categoryAppends = const {},
    this.recentContextOverwrite,
    this.guardrailsAppends = const [],
    this.globalIdentityOverwrite,
    this.categoryProfilesOverwrite,
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

    final newMemory = LivingMemory(
      globalIdentity: newGlobal,
      categoryProfiles: newCategory,
      recentContext: newRecent,
      guardrails: newGuardrails,
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

  Future<void> clearMemory() async {
    final repo = ref.read(livingMemoryRepositoryProvider);
    await repo.saveMemory(LivingMemory.empty());
    state = LivingMemory.empty();
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.remove('coda_onboarding_chips');
  }
}

final livingMemoryProvider = NotifierProvider<LivingMemoryNotifier, LivingMemory>(LivingMemoryNotifier.new);
