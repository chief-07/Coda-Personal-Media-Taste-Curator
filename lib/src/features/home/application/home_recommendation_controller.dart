import 'package:coda/src/features/home/data/mock_recommendations.dart';
import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final selectedMediaTypeProvider =
    NotifierProvider<SelectedMediaType, MediaType>(SelectedMediaType.new);

final activeMediaTypesProvider = Provider<List<MediaType>>((ref) {
  return mediaTypesWithRecommendations;
});

final homeRecommendationProvider = Provider<Recommendation?>((ref) {
  final selectedType = ref.watch(selectedMediaTypeProvider);
  return recommendationForType(selectedType);
});

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
    return MediaType.movie;
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
