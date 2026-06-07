import 'dart:async';
import 'dart:convert';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';
import 'package:coda/src/features/recommendation/data/recommendation_service.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final selectedMediaTypeProvider =
    NotifierProvider<SelectedMediaType, MediaType>(SelectedMediaType.new);

final activeMediaTypesProvider = Provider<List<MediaType>>((ref) {
  final onboardingState = ref.watch(onboardingControllerProvider);
  final lastChipsMessage = onboardingState.messages.reversed.firstWhere(
    (m) => m.chips != null,
    orElse: () => ChatMessage(chips: [], isUser: false),
  );
  final chips = lastChipsMessage.chips ?? [];
  if (chips.isEmpty) {
    return MediaType.values.toList();
  }
  return chips.map((label) {
    final normalizedLabel = label.replaceAll(RegExp(r'[\s_\-]'), '').toLowerCase();
    
    // Direct matches for common variations
    if (normalizedLabel == 'visualnovel' || normalizedLabel == 'visualnovels' || normalizedLabel == 'vn' || normalizedLabel == 'vns') {
      return MediaType.visualNovel;
    }
    if (normalizedLabel == 'game' || normalizedLabel == 'games' || normalizedLabel == 'videogame' || normalizedLabel == 'videogames') {
      return MediaType.game;
    }
    if (normalizedLabel == 'movie' || normalizedLabel == 'movies' || normalizedLabel == 'film' || normalizedLabel == 'films') {
      return MediaType.movie;
    }
    if (normalizedLabel == 'book' || normalizedLabel == 'books' || normalizedLabel == 'novel' || normalizedLabel == 'novels') {
      return MediaType.book;
    }
    if (normalizedLabel == 'manga' || normalizedLabel == 'mangas') {
      return MediaType.manga;
    }
    if (normalizedLabel == 'anime' || normalizedLabel == 'animes') {
      return MediaType.anime;
    }
    if (normalizedLabel == 'tv' || normalizedLabel == 'tvshow' || normalizedLabel == 'tvshows' || normalizedLabel == 'show' || normalizedLabel == 'shows') {
      return MediaType.tv;
    }
    
    return MediaType.values.firstWhere(
      (type) {
        final normalizedTypeLabel = type.label.replaceAll(RegExp(r'[\s_\-]'), '').toLowerCase();
        final normalizedTypeName = type.name.toLowerCase();
        return normalizedTypeLabel == normalizedLabel || 
               normalizedTypeLabel == '${normalizedLabel}s' ||
               '${normalizedTypeLabel}s' == normalizedLabel ||
               normalizedTypeName == normalizedLabel;
      },
      orElse: () => MediaType.movie,
    );
  }).toSet().toList();
});

final recommendationServiceProvider = Provider<RecommendationService>((ref) {
  return RecommendationService();
});

class HomeRecommendationNotifier extends AsyncNotifier<Recommendation?> {
  final Map<MediaType, Recommendation?> _activePicks = {};
  final Map<MediaType, List<Recommendation>> _queues = {};
  final Map<MediaType, bool> _isRefilling = {};
  final Map<MediaType, bool> _isPreWarming = {};

  void _precachePoster(String? posterUrl) {
    if (posterUrl == null || posterUrl.isEmpty || posterUrl.startsWith('holder:')) {
      return;
    }
    try {
      final ImageProvider provider = posterUrl.startsWith('assets/')
          ? AssetImage(posterUrl)
          : NetworkImage(posterUrl);
      provider.resolve(const ImageConfiguration()).addListener(
        ImageStreamListener(
          (_, _) {
            print('[Pre-cache Success] Cached poster image: $posterUrl');
          },
          onError: (e, stack) {
            print('[Pre-cache Error] Failed to resolve poster image: $posterUrl ($e)');
          },
        ),
      );
    } catch (e) {
      print('[Pre-cache Setup Error] Failed to setup image resolution for $posterUrl: $e');
    }
  }

  Future<void> _precacheImageAndWait(String? url) async {
    if (url == null || url.isEmpty || url.startsWith('holder:')) {
      return;
    }
    final completer = Completer<void>();
    ImageStream? stream;
    ImageStreamListener? listener;
    try {
      final ImageProvider provider = url.startsWith('assets/')
          ? AssetImage(url)
          : NetworkImage(url);
      
      stream = provider.resolve(const ImageConfiguration());
      listener = ImageStreamListener(
        (_, _) {
          if (!completer.isCompleted) {
            completer.complete();
          }
        },
        onError: (exception, stackTrace) {
          print('Image precaching error for $url: $exception');
          if (!completer.isCompleted) {
            completer.complete();
          }
        },
      );
      stream.addListener(listener);
    } catch (e) {
      print('Precache setup error: $e');
      if (!completer.isCompleted) {
        completer.complete();
      }
    }
    
    try {
      await completer.future.timeout(const Duration(seconds: 4));
      print('[Pre-cache Success] Cached poster image synchronously: $url');
    } catch (e) {
      print('[Pre-cache Timeout/Error] Stopped waiting for image: $url');
    } finally {
      if (stream != null && listener != null) {
        stream.removeListener(listener);
      }
    }
  }

  bool _isExcluded(String title, LivingMemory memory) {
    final cleanTitle = title.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
    final isSeen = memory.seen.any((t) => t.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '') == cleanTitle);
    final isNotForMe = memory.notForMe.any((t) => t.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '') == cleanTitle);
    return isSeen || isNotForMe;
  }

  @override
  Future<Recommendation?> build() async {
    // Read instead of watch to prevent infinite rebuild loops on memory changes
    final memory = ref.read(livingMemoryProvider);
    final selectedType = ref.watch(selectedMediaTypeProvider);
    final activeTypes = ref.watch(activeMediaTypesProvider);
    final prefs = ref.watch(sharedPreferencesProvider);

    // 1. Load queues from SharedPreferences if not already in memory
    for (final type in activeTypes) {
      if (_queues[type] == null) {
        final queueKey = 'coda_recommendation_queue_${type.name}';
        final queueJson = prefs.getString(queueKey);
        if (queueJson != null) {
          try {
            final List<dynamic> decoded = jsonDecode(queueJson);
            final List<Recommendation> list = decoded.map((item) => Recommendation.fromJson(item)).toList();
            _queues[type] = list;
          } catch (e) {
            print('Error parsing queue for ${type.name}: $e');
          }
        }
      }
    }

    // 2. Return active pick if already in memory
    if (_activePicks[selectedType] != null) {
      _precachePoster(_activePicks[selectedType]!.posterUrl);
      _startBackgroundTasksForActiveTab(memory, selectedType, activeTypes);
      return _activePicks[selectedType];
    }

    // 3. Check SharedPreferences for active pick
    final key = 'coda_active_pick_${selectedType.name}';
    final savedJson = prefs.getString(key);
    if (savedJson != null) {
      try {
        final rec = Recommendation.fromJson(jsonDecode(savedJson));
        if (!_isExcluded(rec.title, memory)) {
          _activePicks[selectedType] = rec;
          _precachePoster(rec.posterUrl);
          _startBackgroundTasksForActiveTab(memory, selectedType, activeTypes);
          return rec;
        } else {
          await prefs.remove(key);
        }
      } catch (e) {
        print('Error parsing active pick: $e');
      }
    }

    // 4. Promote from queue if available
    final queue = _queues[selectedType];
    if (queue != null && queue.isNotEmpty) {
      final validPicks = queue.where((rec) => !_isExcluded(rec.title, memory)).toList();
      _queues[selectedType] = validPicks;
      await _saveQueue(selectedType);

      if (validPicks.isNotEmpty) {
        final first = validPicks.removeAt(0);
        _activePicks[selectedType] = first;
        await prefs.setString(key, jsonEncode(first.toJson()));
        await _saveQueue(selectedType);
        _precachePoster(first.posterUrl);
        _startBackgroundTasksForActiveTab(memory, selectedType, activeTypes);
        return first;
      }
    }

    // 5. Fetch new recommendations (with loading state)
    final recs = await _fetchNewRecommendations(memory, selectedType);
    if (recs.isNotEmpty) {
      final active = recs.removeAt(0);
      _activePicks[selectedType] = active;
      await prefs.setString(key, jsonEncode(active.toJson()));
      
      _queues[selectedType] = recs;
      await _saveQueue(selectedType);

      _startBackgroundTasksForActiveTab(memory, selectedType, activeTypes);
      return active;
    }
    return null;
  }

  void _startBackgroundTasksForActiveTab(LivingMemory memory, MediaType selectedType, List<MediaType> activeTypes) {
    Future.microtask(() async {
      // 1. Lazy-fetch the pitch paragraphs for the active card (does not block showing card)
      await fetchPitchForActivePick(selectedType);

      // 2. Wait 2 seconds to give active card image full priority before refilling queue
      await Future.delayed(const Duration(milliseconds: 2000));
      if (selectedType != ref.read(selectedMediaTypeProvider)) return;
      
      final currentQueue = _queues[selectedType] ?? [];
      if (currentQueue.length < 2) {
        await _refillQueue(memory, selectedType);
      }

      // 3. Wait 2 seconds (total 4s) before pre-warming other tabs sequentially
      await Future.delayed(const Duration(milliseconds: 2000));
      if (selectedType != ref.read(selectedMediaTypeProvider)) return;
      _scheduleStaggeredPreWarming(memory, selectedType, activeTypes);
    });
  }

  Future<void> fetchPitchForActivePick(MediaType type) async {
    final active = _activePicks[type];
    if (active == null || active.pitch.isNotEmpty) return;

    try {
      final memory = ref.read(livingMemoryProvider);
      final service = ref.read(recommendationServiceProvider);
      final pitchParagraphs = await service.fetchPitch(
        memory: memory,
        title: active.title,
        mediaType: type.name,
      );

      if (pitchParagraphs.isNotEmpty && _activePicks[type]?.title == active.title) {
        final updated = Recommendation(
          id: active.id,
          title: active.title,
          mediaType: active.mediaType,
          codaBlurb: active.codaBlurb,
          pitch: pitchParagraphs,
          posterUrl: active.posterUrl,
          codaNote: active.codaNote,
          description: active.description,
          genres: active.genres,
          tags: active.tags,
          fitSignals: active.fitSignals,
          posterGradient: active.posterGradient,
          releaseYear: active.releaseYear,
        );
        _activePicks[type] = updated;

        // Save updated active pick to SharedPreferences
        final prefs = ref.read(sharedPreferencesProvider);
        final key = 'coda_active_pick_${type.name}';
        await prefs.setString(key, jsonEncode(updated.toJson()));

        // If the user is still on this tab, notify UI to render the pitch
        final selectedType = ref.read(selectedMediaTypeProvider);
        if (type == selectedType) {
          state = AsyncValue.data(updated);
          print('[Pitch Lazy Load] Updated active pick pitch for ${type.name}: "${updated.title}"');
        }
      }
    } catch (e) {
      print('[Pitch Lazy Load Error] Failed for ${type.name}: $e');
    }
  }

  void _scheduleStaggeredPreWarming(LivingMemory memory, MediaType selectedType, List<MediaType> activeTypes) {
    final otherTypes = activeTypes.where((type) {
      if (type == selectedType) return false;
      if (_activePicks.containsKey(type) && _activePicks[type] != null) return false;
      if (_isPreWarming[type] == true) return false;
      return true;
    }).toList();

    if (otherTypes.isNotEmpty) {
      _staggeredPreWarm(otherTypes, memory);
    }
  }

  Future<void> _staggeredPreWarm(List<MediaType> types, LivingMemory memory) async {
    for (final type in types) {
      // Re-read selected type to ensure the user hasn't switched to this tab in the meantime
      final currentSelected = ref.read(selectedMediaTypeProvider);
      if (type == currentSelected) continue;

      if (_activePicks[type] == null && _isPreWarming[type] != true) {
        await _preWarmTab(memory, type);
        // Wait 1.5 seconds sequentially between pre-warming different tabs
        await Future.delayed(const Duration(milliseconds: 1500));
      }
    }
  }

  Future<void> _preWarmTab(LivingMemory memory, MediaType type) async {
    final selectedType = ref.read(selectedMediaTypeProvider);
    if (type == selectedType || _isPreWarming[type] == true || _activePicks[type] != null) {
      return;
    }
    _isPreWarming[type] = true;

    try {
      final key = 'coda_active_pick_${type.name}';
      final prefs = ref.read(sharedPreferencesProvider);
      
      // 1. Check SharedPreferences active pick
      final savedJson = prefs.getString(key);
      if (savedJson != null) {
        try {
          final rec = Recommendation.fromJson(jsonDecode(savedJson));
          if (!_isExcluded(rec.title, memory)) {
            _activePicks[type] = rec;
            _precachePoster(rec.posterUrl);
            
            final queue = _queues[type] ?? [];
            if (queue.length < 2) {
              await _refillQueue(memory, type);
            }
            return;
          } else {
            await prefs.remove(key);
          }
        } catch (_) {}
      }

      // 2. Promote from queue if available
      final queue = _queues[type] ?? [];
      final validPicks = queue.where((rec) => !_isExcluded(rec.title, memory)).toList();
      _queues[type] = validPicks;
      await _saveQueue(type);

      if (validPicks.isNotEmpty) {
        final first = validPicks.removeAt(0);
        _activePicks[type] = first;
        await prefs.setString(key, jsonEncode(first.toJson()));
        await _saveQueue(type);
        _precachePoster(first.posterUrl);
        return;
      }

      // 3. Fetch recommendations from backend
      final recs = await _fetchNewRecommendations(memory, type);
      if (recs.isNotEmpty) {
        final active = recs.removeAt(0);
        _activePicks[type] = active;
        await prefs.setString(key, jsonEncode(active.toJson()));
        
        _queues[type] = recs;
        await _saveQueue(type);
      }
    } catch (e) {
      print('Error pre-warming tab ${type.name}: $e');
    } finally {
      _isPreWarming[type] = false;
    }
  }

  Future<void> _refillQueue(LivingMemory memory, MediaType type) async {
    if (_isRefilling[type] == true) return;
    _isRefilling[type] = true;

    try {
      final queueTitles = (_queues[type] ?? []).map((r) => r.title).toList();
      final activeTitle = _activePicks[type]?.title;
      final exclusions = [...queueTitles, if (activeTitle != null) activeTitle];

      final service = ref.read(recommendationServiceProvider);
      final results = await service.fetchRecommendations(
        memory, 
        type, 
        additionalExclusions: exclusions
      );

      final newRecs = results
          .map((r) => r.toDomain())
          .where((rec) => !_isExcluded(rec.title, memory))
          .toList();
      
      final currentQueue = _queues[type] ?? [];
      final updatedQueue = [...currentQueue, ...newRecs];
      _queues[type] = updatedQueue;
      
      await _saveQueue(type);

      print('[Queue Refill] successfully refilled queue for ${type.name}. Length: ${updatedQueue.length}');
    } catch (e) {
      print('[Queue Refill Error] Failed for ${type.name}: $e');
    } finally {
      _isRefilling[type] = false;
    }
  }

  Future<void> _saveQueue(MediaType type) async {
    final prefs = ref.read(sharedPreferencesProvider);
    final key = 'coda_recommendation_queue_${type.name}';
    final queue = _queues[type] ?? [];
    if (queue.isEmpty) {
      await prefs.remove(key);
    } else {
      await prefs.setString(key, jsonEncode(queue.map((r) => r.toJson()).toList()));
    }
  }

  Future<List<Recommendation>> _fetchNewRecommendations(LivingMemory memory, MediaType selectedType) async {
    if (memory.globalIdentity.isEmpty && memory.categoryProfiles.isEmpty && memory.recentContext.isEmpty) {
      return [];
    }

    final service = ref.read(recommendationServiceProvider);
    try {
      final results = await service.fetchRecommendations(memory, selectedType);
      final recs = results
          .map((r) => r.toDomain())
          .where((rec) => !_isExcluded(rec.title, memory))
          .toList();

      if (recs.isNotEmpty) {
        await _precacheImageAndWait(recs.first.posterUrl);
        if (recs.length > 1) {
          _precachePoster(recs[1].posterUrl);
        }
      }
      return recs;
    } catch (e) {
      print('Error fetching recommendations: $e');
      return [];
    }
  }

  Future<void> reload() async {
    state = const AsyncValue.loading();
    final memory = ref.read(livingMemoryProvider);
    final selectedType = ref.read(selectedMediaTypeProvider);
    final activeTypes = ref.read(activeMediaTypesProvider);
    final prefs = ref.read(sharedPreferencesProvider);
    
    final activeKey = 'coda_active_pick_${selectedType.name}';

    _activePicks.remove(selectedType);
    await prefs.remove(activeKey);

    final queue = _queues[selectedType] ?? [];
    final validPicks = queue.where((rec) => !_isExcluded(rec.title, memory)).toList();
    _queues[selectedType] = validPicks;
    await _saveQueue(selectedType);

    if (validPicks.isNotEmpty) {
      final nextRec = validPicks.removeAt(0);
      _activePicks[selectedType] = nextRec;
      await prefs.setString(activeKey, jsonEncode(nextRec.toJson()));
      await _saveQueue(selectedType);

      state = AsyncValue.data(nextRec);
      _startBackgroundTasksForActiveTab(memory, selectedType, activeTypes);
    } else {
      final recs = await _fetchNewRecommendations(memory, selectedType);
      if (recs.isNotEmpty) {
        final active = recs.removeAt(0);
        _activePicks[selectedType] = active;
        await prefs.setString(activeKey, jsonEncode(active.toJson()));

        _queues[selectedType] = recs;
        await _saveQueue(selectedType);

        state = AsyncValue.data(active);
        _startBackgroundTasksForActiveTab(memory, selectedType, activeTypes);
      } else {
        state = const AsyncValue.data(null);
      }
    }
  }
}

final homeRecommendationProvider = AsyncNotifierProvider<HomeRecommendationNotifier, Recommendation?>(
  HomeRecommendationNotifier.new,
);

final savedRecommendationsProvider =
    NotifierProvider<SavedRecommendations, List<Recommendation>>(
      SavedRecommendations.new,
    );

final activeSessionProvider = NotifierProvider<ActiveSession, Recommendation?>(
  ActiveSession.new,
);

class SavedRecommendations extends Notifier<List<Recommendation>> {
  @override
  List<Recommendation> build() {
    return const [];
  }

  void save(Recommendation recommendation) {
    if (state.any((item) => item.id == recommendation.id)) return;
    state = [...state, recommendation];
  }
}

class SelectedMediaType extends Notifier<MediaType> {
  @override
  MediaType build() {
    final activeTypes = ref.watch(activeMediaTypesProvider);
    final prefs = ref.watch(sharedPreferencesProvider);
    final savedTypeName = prefs.getString('coda_selected_media_type');
    if (savedTypeName != null) {
      try {
        final savedType = MediaType.values.firstWhere((e) => e.name == savedTypeName);
        if (activeTypes.contains(savedType)) {
          return savedType;
        }
      } catch (_) {}
    }
    return activeTypes.isNotEmpty ? activeTypes.first : MediaType.movie;
  }

  void select(MediaType type) {
    state = type;
    ref.read(sharedPreferencesProvider).setString('coda_selected_media_type', type.name);
  }
}

class ActiveSession extends Notifier<Recommendation?> {
  @override
  Recommendation? build() {
    return null;
  }

  void start(Recommendation recommendation) {
    state = recommendation;
  }
}
