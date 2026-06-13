import 'package:coda/src/app/coda_app.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('Coda app shows the home recommendation', (tester) async {
    SharedPreferences.setMockInitialValues({
      'living_memory_v1': '{}',
      'coda_onboarding_completed': true,
      'coda_selected_media_type': 'movie',
      'coda_recommendation_cache_migrated_v4': true,
      'coda_active_pick_movie': '{"id":"movie-1","title":"Interstellar","mediaType":"movie","codaBlurb":"The definitive 21st century Space Odyssey","codaNote":"This is Nolan...","description":"A team of explorers...","genres":["Sci-fi","Drama"],"tags":["2h 49m"],"fitSignals":["emotional spectacle"],"posterGradient":[4279044906,4279974475,4291335532],"posterUrl":"assets/interstellar.jpg","releaseYear":"2014","pitch":["Trust me"]}',
    });
    final prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
        ],
        child: const CodaApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Movies'), findsOneWidget);
    expect(find.textContaining('Interstellar'), findsWidgets);
    expect(find.text('2h 49m'), findsWidgets);

    // Clear pending background timers
    await tester.pump(const Duration(seconds: 30));
  });
}
