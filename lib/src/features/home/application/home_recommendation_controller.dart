import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';
import 'package:coda/src/features/recommendation/data/recommendation_service.dart';
import 'package:coda/src/features/recommendation/application/audio_player_controller.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:coda/src/core/providers/api_config.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/providers/watchlist_mode_provider.dart';
import 'package:coda/src/core/providers/memories_mode_provider.dart';

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
      orElse: () => MediaType.custom(label),
    );
  }).toSet().toList();
});



class HomeRecommendationNotifier extends AsyncNotifier<Recommendation?> {
  final Map<MediaType, Recommendation?> _activePicks = {};
  final Map<MediaType, List<Recommendation>> _queues = {};
  final Map<MediaType, bool> _isRefilling = {};
  final Map<MediaType, bool> _isPreWarming = {};
  final Set<MediaType> _initialBatchComplete = {};
  int _modeEpoch = 0;

  String _resolveCORSUrl(String url) {
    if (url.startsWith('/')) {
      return '${getApiBaseUrl()}$url';
    } else if (kIsWeb && url.startsWith('http') && !url.contains('/api/recommend/proxy-image')) {
      return '${getApiBaseUrl()}/api/recommend/proxy-image?url=${Uri.encodeComponent(url)}';
    }
    return url;
  }

  String _getAmbientContext() {
    final hour = DateTime.now().hour;
    if (hour >= 5 && hour < 12) return "Sunny Morning";
    if (hour >= 12 && hour < 17) return "Afternoon";
    if (hour >= 17 && hour < 20) return "Evening";
    if (hour >= 20 && hour <= 23) return "Late Night";
    return "Midnight / Very Late";
  }

  void _precachePoster(String? posterUrl) {
    if (posterUrl == null || posterUrl.isEmpty || posterUrl.startsWith('holder:')) {
      return;
    }
    try {
      final resolvedUrl = _resolveCORSUrl(posterUrl);
      final ImageProvider provider = resolvedUrl.startsWith('assets/')
          ? AssetImage(resolvedUrl)
          : NetworkImage(resolvedUrl);
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
      final resolvedUrl = _resolveCORSUrl(url);
      final ImageProvider provider = resolvedUrl.startsWith('assets/')
          ? AssetImage(resolvedUrl)
          : NetworkImage(resolvedUrl);
      
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
    // In Amnesia Mode (Memories OFF), Coda has zero memory of what the user has seen or rejected!
    if (!ref.read(memoriesModeProvider)) {
      return false;
    }
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

    // One-time cache migration: Clear stale recommendation cache
    const migrationKey = 'coda_recommendation_cache_migrated_v5';
    final hasMigrated = prefs.getBool(migrationKey) ?? false;
    if (!hasMigrated) {
      print('[Cache Migration] Clearing stale recommendation cache (active picks & queues) for v5 updates...');
      for (final type in {...MediaType.values, ...activeTypes}) {
        await prefs.remove('coda_active_pick_${type.name}');
        await prefs.remove('coda_recommendation_queue_${type.name}');
      }
      await prefs.setBool(migrationKey, true);
    }

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

    // 5. Fetch new recommendations — retry up to 3 times before giving up
    const maxRetries = 3;
    for (int attempt = 1; attempt <= maxRetries; attempt++) {
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

      if (attempt < maxRetries) {
        debugPrint('[Rec] Empty response for ${selectedType.name} (attempt $attempt/$maxRetries), retrying in 2s...');
        await Future.delayed(const Duration(seconds: 2));
      } else {
        debugPrint('[Rec] No recommendations found for ${selectedType.name} after $maxRetries attempts.');
      }
    }
    return null;
  }

  void _startBackgroundTasksForActiveTab(LivingMemory memory, MediaType selectedType, List<MediaType> activeTypes) {
    final epoch = _modeEpoch;
    Future.microtask(() async {
      if (epoch != _modeEpoch) return;
      // 1. If queue is low, trigger background refill immediately (no delay!)
      final currentQueue = _queues[selectedType] ?? [];
      if (currentQueue.length < 3) {
        _refillQueue(memory, selectedType, epoch: epoch);
      }

      // 2. Lazy-fetch the pitch paragraphs for the active card (does not block showing card)
      await fetchPitchForActivePick(selectedType);

      // 3. Wait 2 seconds before pre-warming other tabs sequentially
      await Future.delayed(const Duration(milliseconds: 2000));
      if (epoch != _modeEpoch) return;
      if (selectedType != ref.read(selectedMediaTypeProvider)) return;
      _scheduleStaggeredPreWarming(memory, selectedType, activeTypes, epoch: epoch);
    });
  }

  Future<void> fetchPitchForActivePick(MediaType type) async {
    final active = _activePicks[type];
    if (active == null || active.pitch.isNotEmpty) return;
    final epoch = _modeEpoch;

    try {
      final memory = ref.read(livingMemoryProvider);
      final service = ref.read(recommendationServiceProvider);
      final pitchData = await service.fetchPitch(
        memory: memory,
        title: active.title,
        mediaType: type.name,
        memoriesEnabled: ref.read(memoriesModeProvider),
      );
      if (epoch != _modeEpoch) return;

      final pitchParagraphs = pitchData['pitch_paragraphs'] as List<String>? ?? [];
      final codaBlurb = pitchData['coda_blurb'] as String? ?? '';

      if (pitchParagraphs.isNotEmpty && _activePicks[type]?.title == active.title) {
        final updated = Recommendation(
          id: active.id,
          title: active.title,
          mediaType: active.mediaType,
          codaBlurb: codaBlurb.isNotEmpty ? codaBlurb : active.codaBlurb,
          pitch: pitchParagraphs,
          posterUrl: active.posterUrl,
          codaNote: active.codaNote,
          description: active.description,
          genres: active.genres,
          tags: active.tags,
          fitSignals: active.fitSignals,
          posterGradient: active.posterGradient,
          releaseYear: active.releaseYear,
          ostUrl: active.ostUrl,
          trailerUrl: active.trailerUrl,
          studio: active.studio,
          recalledMemories: active.recalledMemories,
          queryUsed: active.queryUsed,
          moodAngle: active.moodAngle,
          attributedMemory: active.attributedMemory,
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

  void _scheduleStaggeredPreWarming(LivingMemory memory, MediaType selectedType, List<MediaType> activeTypes, {int? epoch}) {
    final targetEpoch = epoch ?? _modeEpoch;
    final otherTypes = activeTypes.where((type) {
      if (type == selectedType) return false;
      if (_activePicks.containsKey(type) && _activePicks[type] != null) return false;
      if (_isPreWarming[type] == true) return false;
      return true;
    }).toList();

    if (otherTypes.isNotEmpty) {
      _staggeredPreWarm(otherTypes, memory, targetEpoch);
    }
  }

  Future<void> _staggeredPreWarm(List<MediaType> types, LivingMemory memory, int epoch) async {
    for (final type in types) {
      if (epoch != _modeEpoch) return;
      // Re-read selected type to ensure the user hasn't switched to this tab in the meantime
      final currentSelected = ref.read(selectedMediaTypeProvider);
      if (type == currentSelected) continue;

      if (_activePicks[type] == null && _isPreWarming[type] != true) {
        await _preWarmTab(memory, type, epoch: epoch);
        // Wait 2.0 seconds sequentially between pre-warming different tabs to prevent backend burst
        await Future.delayed(const Duration(milliseconds: 2000));
      }
    }
  }

  Future<void> _preWarmTab(LivingMemory memory, MediaType type, {int? epoch}) async {
    final targetEpoch = epoch ?? _modeEpoch;
    if (targetEpoch != _modeEpoch) return;
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
      if (savedJson != null && targetEpoch == _modeEpoch) {
        try {
          final rec = Recommendation.fromJson(jsonDecode(savedJson));
          if (!_isExcluded(rec.title, memory)) {
            _activePicks[type] = rec;
            _precachePoster(rec.posterUrl);
            if (rec.ostUrl != null && rec.ostUrl!.isNotEmpty) {
              ref.read(audioPlayerControllerProvider.notifier).precacheAudio(rec.ostUrl!);
            }
            
            final queue = _queues[type] ?? [];
            if (queue.length < 2) {
              await _refillQueue(memory, type, epoch: targetEpoch);
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

      if (validPicks.isNotEmpty && targetEpoch == _modeEpoch) {
        final first = validPicks.removeAt(0);
        _activePicks[type] = first;
        await prefs.setString(key, jsonEncode(first.toJson()));
        await _saveQueue(type);
        _precachePoster(first.posterUrl);
        if (first.ostUrl != null && first.ostUrl!.isNotEmpty) {
          ref.read(audioPlayerControllerProvider.notifier).precacheAudio(first.ostUrl!);
        }
        return;
      }

      // 3. Fetch recommendations from backend
      final recs = await _fetchNewRecommendations(memory, type);
      if (targetEpoch != _modeEpoch) return;
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
      if (targetEpoch == _modeEpoch) {
        _isPreWarming[type] = false;
      }
    }
  }

  Future<void> _refillQueue(LivingMemory memory, MediaType type, {int? epoch}) async {
    final targetEpoch = epoch ?? _modeEpoch;
    if (targetEpoch != _modeEpoch) return;
    if (_isRefilling[type] == true) return;
    _isRefilling[type] = true;

    try {
      while (targetEpoch == _modeEpoch) {
        final currentSelected = ref.read(selectedMediaTypeProvider);
        final targetLimit = (type == currentSelected) ? 3 : 2;

        final currentQueue = _queues[type] ?? [];
        if (currentQueue.length >= targetLimit) {
          break;
        }

        final memoriesEnabled = ref.read(memoriesModeProvider);
        final queueTitles = currentQueue.map((r) => r.title).toList();
        final activeTitle = _activePicks[type]?.title;
        // In Amnesia Mode, allow repeats across cards so Coda visibly forgets what it just showed
        final exclusions = memoriesEnabled
            ? [...queueTitles, if (activeTitle != null) activeTitle]
            : <String>[];

        print('[Queue Refill] Fetching 1 background recommendation for ${type.name} to refill queue (memories=$memoriesEnabled)...');
        final service = ref.read(recommendationServiceProvider);
        final isWatchlistMode = ref.read(watchlistModeProvider);
        final ambientContext = _initialBatchComplete.contains(type) ? null : _getAmbientContext();
        final results = await service.fetchRecommendations(
          memory, 
          type, 
          additionalExclusions: exclusions,
          limit: 1,
          watchlistOnly: isWatchlistMode,
          memoriesEnabled: memoriesEnabled,
          ambientContext: ambientContext,
        );
        if (targetEpoch != _modeEpoch) break;

        if (results.isEmpty) {
          print('[Queue Refill] No recommendations returned for ${type.name}. Stopping refill.');
          break;
        }

        final newRecs = results
            .map((r) => r.toDomain())
            .where((rec) => !_isExcluded(rec.title, memory))
            .toList();
        
        for (final rec in newRecs) {
          if (rec.ostUrl != null && rec.ostUrl!.isNotEmpty) {
            ref.read(audioPlayerControllerProvider.notifier).precacheAudio(rec.ostUrl!);
          }
        }
        
        if (newRecs.isNotEmpty && targetEpoch == _modeEpoch) {
          _queues[type] = [..._queues[type] ?? [], ...newRecs];
          await _saveQueue(type);
          _precachePoster(newRecs.first.posterUrl);
          print('[Queue Refill] Successfully added "${newRecs.first.title}" to ${type.name} queue. Current size: ${_queues[type]?.length}');
          // Pause 1.5s between background refills to avoid rate-limiting upstream LLM and asset services
          await Future.delayed(const Duration(milliseconds: 1500));
        } else {
          break;
        }
      }
    } catch (e) {
      print('[Queue Refill Error] Failed for ${type.name}: $e');
    } finally {
      if (targetEpoch == _modeEpoch) {
        _isRefilling[type] = false;
      }
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

  Future<List<Recommendation>> _fetchNewRecommendations(LivingMemory memory, MediaType selectedType, {int limit = 1}) async {
    final memoriesEnabled = ref.read(memoriesModeProvider);
    if (memoriesEnabled && memory.globalIdentity.isEmpty && memory.categoryProfiles.isEmpty && memory.recentContext.isEmpty) {
      return [];
    }

    final service = ref.read(recommendationServiceProvider);
    final isWatchlistMode = ref.read(watchlistModeProvider);
    final ambientContext = _initialBatchComplete.contains(selectedType) ? null : _getAmbientContext();
    
    try {
      final results = await service.fetchRecommendations(
        memory, 
        selectedType, 
        limit: limit, 
        watchlistOnly: isWatchlistMode, 
        memoriesEnabled: memoriesEnabled,
        ambientContext: ambientContext
      );
      _initialBatchComplete.add(selectedType);
      final recs = results
          .map((r) => r.toDomain())
          .where((rec) => !_isExcluded(rec.title, memory))
          .toList();

      if (recs.isNotEmpty) {
        await Future.wait<void>([
          _precacheImageAndWait(recs.first.posterUrl),
          if (recs.first.ostUrl != null && recs.first.ostUrl!.isNotEmpty)
            ref.read(audioPlayerControllerProvider.notifier).precacheAudio(recs.first.ostUrl!),
        ]);
        if (recs.length > 1) {
          _precachePoster(recs[1].posterUrl);
          if (recs[1].ostUrl != null && recs[1].ostUrl!.isNotEmpty) {
            ref.read(audioPlayerControllerProvider.notifier).precacheAudio(recs[1].ostUrl!);
          }
        }
      }

      return recs;
    } catch (e) {
      print('Error fetching recommendations: $e');
      return [];
    }
  }

  /// Lightweight single-pick refresh used during onboarding chat turns:
  /// - Fetches ONLY 1 recommendation so the blurred background poster color morphs
  ///   smoothly on every turn AND the user's #1 pick is ready in 0ms upon entering Home.
  /// - Does NOT flash state to loading (preserving smooth AnimatedSwitcher transitions).
  /// - Does NOT trigger queue refills, lazy pitch fetches, or multi-tab pre-warming
  ///   until the user actually enters HomeScreen.
  Future<void> refreshOnboardingPreview() async {
    final memory = ref.read(livingMemoryProvider);
    final selectedType = ref.read(selectedMediaTypeProvider);
    final prefs = ref.read(sharedPreferencesProvider);
    final activeKey = 'coda_active_pick_${selectedType.name}';

    final recs = await _fetchNewRecommendations(memory, selectedType, limit: 1);
    if (recs.isNotEmpty) {
      final active = recs.first;
      _activePicks[selectedType] = active;
      await prefs.setString(activeKey, jsonEncode(active.toJson()));
      state = AsyncValue.data(active);
    }
  }

  /// Starts queue refills, pitch check, and multi-tab pre-warming once the user
  /// enters HomeScreen after onboarding.
  void ensureBackgroundTasksForHome() {
    final memory = ref.read(livingMemoryProvider);
    final selectedType = ref.read(selectedMediaTypeProvider);
    final activeTypes = ref.read(activeMediaTypesProvider);
    if (_activePicks[selectedType] != null) {
      _startBackgroundTasksForActiveTab(memory, selectedType, activeTypes);
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
      for (int attempt = 1; attempt <= 2; attempt++) {
        final recs = await _fetchNewRecommendations(memory, selectedType);
        if (recs.isNotEmpty) {
          final active = recs.removeAt(0);
          _activePicks[selectedType] = active;
          await prefs.setString(activeKey, jsonEncode(active.toJson()));

          _queues[selectedType] = recs;
          await _saveQueue(selectedType);

          state = AsyncValue.data(active);
          _startBackgroundTasksForActiveTab(memory, selectedType, activeTypes);
          return;
        }
        if (attempt < 2) {
          await Future.delayed(const Duration(seconds: 1));
        }
      }
      state = const AsyncValue.data(null);
    }
  }

  Future<void> reloadFresh({bool clearAll = false}) async {
    _modeEpoch++;
    final currentEpoch = _modeEpoch;
    state = const AsyncValue.loading();
    final prefs = ref.read(sharedPreferencesProvider);
    final selectedType = ref.read(selectedMediaTypeProvider);
    final activeTypes = ref.read(activeMediaTypesProvider);
    final memory = ref.read(livingMemoryProvider);

    if (clearAll) {
      _activePicks.clear();
      _queues.clear();
      _isRefilling.clear();
      _isPreWarming.clear();
      _initialBatchComplete.clear();
      for (final type in {...MediaType.values, ...activeTypes}) {
        await prefs.remove('coda_active_pick_${type.name}');
        await prefs.remove('coda_recommendation_queue_${type.name}');
      }
    } else {
      _activePicks.remove(selectedType);
      _queues.remove(selectedType);
      _isRefilling.remove(selectedType);
      _isPreWarming.remove(selectedType);
      await prefs.remove('coda_active_pick_${selectedType.name}');
      await prefs.remove('coda_recommendation_queue_${selectedType.name}');
    }

    for (int attempt = 1; attempt <= 2; attempt++) {
      if (currentEpoch != _modeEpoch) return;
      final recs = await _fetchNewRecommendations(memory, selectedType);
      if (currentEpoch != _modeEpoch) return;
      if (recs.isNotEmpty) {
        final active = recs.removeAt(0);
        _activePicks[selectedType] = active;
        await prefs.setString('coda_active_pick_${selectedType.name}', jsonEncode(active.toJson()));

        _queues[selectedType] = recs;
        await _saveQueue(selectedType);

        state = AsyncValue.data(active);
        _startBackgroundTasksForActiveTab(memory, selectedType, activeTypes);
        return;
      }
      if (attempt < 2) {
        await Future.delayed(const Duration(seconds: 1));
      }
    }
    if (currentEpoch == _modeEpoch) {
      state = const AsyncValue.data(null);
    }
  }

  Future<void> setActivePick(Recommendation recommendation) async {
    final prefs = ref.read(sharedPreferencesProvider);
    final type = recommendation.mediaType;
    final key = 'coda_active_pick_${type.name}';
    _activePicks[type] = recommendation;
    await prefs.setString(key, jsonEncode(recommendation.toJson()));
    
    // Clear buffer pick to force a new buffer pre-warm
    final bufferKey = 'coda_buffer_pick_${type.name}';
    await prefs.remove(bufferKey);
    
    final selectedType = ref.read(selectedMediaTypeProvider);
    if (selectedType == type) {
      state = AsyncValue.data(recommendation);
      _startBackgroundTasksForActiveTab(ref.read(livingMemoryProvider), type, ref.read(activeMediaTypesProvider));
    }
  }

  Future<void> clearActivePick() async {
    _modeEpoch++;
    final prefs = ref.read(sharedPreferencesProvider);
    final activeTypes = ref.read(activeMediaTypesProvider);
    _activePicks.clear();
    _queues.clear();
    _isRefilling.clear();
    _isPreWarming.clear();
    for (final type in {...MediaType.values, ...activeTypes}) {
      await prefs.remove('coda_active_pick_${type.name}');
      await prefs.remove('coda_recommendation_queue_${type.name}');
    }
    state = const AsyncValue.data(null);
  }

  Future<void> clearActivePickQueue(MediaType type) async {
    final prefs = ref.read(sharedPreferencesProvider);
    _activePicks.remove(type);
    _queues.remove(type);
    await prefs.remove('coda_active_pick_${type.name}');
    await prefs.remove('coda_recommendation_queue_${type.name}');
    state = const AsyncValue.loading();
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
        final savedType = activeTypes.firstWhere((e) => e.name == savedTypeName);
        return savedType;
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
    final prefs = ref.watch(sharedPreferencesProvider);
    final jsonStr = prefs.getString('coda_active_session_recommendation');
    if (jsonStr != null) {
      try {
        final Map<String, dynamic> decoded = jsonDecode(jsonStr) as Map<String, dynamic>;
        return Recommendation.fromJson(decoded);
      } catch (e) {
        debugPrint('Error decoding active session: $e');
      }
    }
    return null;
  }

  void start(Recommendation recommendation) {
    state = recommendation;
    try {
      ref.read(sharedPreferencesProvider).setString(
        'coda_active_session_recommendation',
        jsonEncode(recommendation.toJson()),
      );
    } catch (e) {
      debugPrint('Error saving active session: $e');
    }
  }

  void clear() {
    state = null;
    try {
      ref.read(sharedPreferencesProvider).remove('coda_active_session_recommendation');
    } catch (e) {
      debugPrint('Error clearing active session: $e');
    }
  }
}
