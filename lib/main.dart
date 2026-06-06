import 'dart:convert';

import 'package:coda/src/app/coda_app.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Fortune's harmonized taste profile from the onboarding session.
/// This is seeded once — only if no profile exists — so the app
/// skips onboarding entirely and goes straight to recommendations.
const _seededProfile = {
  'globalIdentity': [
    'Fortune is an introspective 18-year-old with a deep appreciation for narratives that delve into the intricacies of love, loss, and the human experience. Their temperament leans towards the contemplative, as they seek out character-driven stories that resonate with emotional depth. This demographic context suggests a youthful yet mature outlook, indicative of someone navigating the complexities of adolescence while yearning for profound connections in their media.',
    'Across various formats, Fortune seeks stories that intertwine psychological exploration with rich character development. They are particularly drawn to narratives featuring diverse casts, often highlighting trauma and personal growth, which reflect their own desire for understanding and connection. Their preferences for Japanese media aesthetics, especially in anime and visual novels, showcase a strong affinity for emotional storytelling that balances humor with serious themes, creating a tapestry of experiences that resonate deeply with their introspective nature.',
  ],
  'categoryProfiles': {
    'anime': [
      'Loves deep psychological stories with rich character development and emotional stakes, particularly from the 2000s to 2010s.',
      'Favorites include Steins;Gate for its blend of humor and emotional depth, along with Monster, Monogatari series, Bunny Girl Senpai, Madoka Magica, and Welcome to the NHK.',
    ],
    'visual_novels': [
      'Loves character-driven stories with romance and emotional depth, particularly in slice of life and school settings.',
      'Enjoys diverse characters with their own stories, especially connecting with Hanako from Katawa Shoujo and Ciel from Tsukihime, while preferring remote settings and exploring different character routes.',
    ],
  },
  'recentContext':
      'Currently exploring visual novels that prioritize romance and character depth in slice of life and school settings, while avoiding BL content.',
  'guardrails': [
    'Avoids generic, mass appeal content with no substance.',
    'Not a fan of generic isekai',
    'No long series like One Piece unless they are peak quality.',
    'No BL content',
  ],
};

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: 'assets/.env');
  final prefs = await SharedPreferences.getInstance();

  // One-time profile seed: if no profile exists yet, write Fortune's
  // harmonized taste profile so onboarding is skipped from first launch.
  const memoryKey = 'living_memory_v1';
  if (!prefs.containsKey(memoryKey)) {
    await prefs.setString(memoryKey, jsonEncode(_seededProfile));
    debugPrint('[Coda] Profile seeded — skipping onboarding.');
  }

  runApp(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
      ],
      child: const CodaApp(),
    ),
  );
}
