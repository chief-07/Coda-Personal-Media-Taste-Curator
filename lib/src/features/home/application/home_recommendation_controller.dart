import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';
import 'package:coda/src/features/recommendation/data/recommendation_service.dart';
import 'package:coda/src/core/memory/living_memory.dart';
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
  final Map<MediaType, Recommendation?> _cache = {};
  String? _lastMemorySignature;

  @override
  Future<Recommendation?> build() async {
    final memory = ref.watch(livingMemoryProvider);
    final selectedType = ref.watch(selectedMediaTypeProvider);

    final currentSignature = _getMemorySignature(memory);
    if (_lastMemorySignature != currentSignature) {
      _cache.clear();
      _lastMemorySignature = currentSignature;
    }

    if (_cache.containsKey(selectedType)) {
      return _cache[selectedType];
    }

    final rec = await _fetchNewRecommendation(memory, selectedType);
    _cache[selectedType] = rec;
    return rec;
  }

  String _getMemorySignature(LivingMemory memory) {
    final identityStr = memory.globalIdentity.join(',');
    final categoriesStr = memory.categoryProfiles.entries.map((e) => '${e.key}:${e.value.join(',')}').join('|');
    return '$identityStr|$categoriesStr|${memory.recentContext}|${memory.guardrails.join(',')}';
  }

  Future<Recommendation?> _fetchNewRecommendation(LivingMemory memory, MediaType selectedType) async {
    if (memory.globalIdentity.isEmpty && memory.categoryProfiles.isEmpty && memory.recentContext.isEmpty) {
      return null;
    }

    final service = ref.read(recommendationServiceProvider);
    
    try {
      final result = await service.fetchRecommendation(memory, selectedType);
      return result.toDomain();
    } catch (e) {
      print('Error fetching recommendation: $e');
      return null; // Handle UI fallback
    }
  }

  Future<void> reload() async {
    state = const AsyncValue.loading();
    final memory = ref.read(livingMemoryProvider);
    final selectedType = ref.read(selectedMediaTypeProvider);
    _cache.remove(selectedType);
    state = await AsyncValue.guard(() => _fetchNewRecommendation(memory, selectedType));
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
    return activeTypes.isNotEmpty ? activeTypes.first : MediaType.movie;
  }

  void select(MediaType type) {
    state = type;
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
