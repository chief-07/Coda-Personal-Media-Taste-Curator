import 'package:coda/src/features/ask/presentation/ask_coda_screen.dart';
import 'package:coda/src/features/home/data/mock_recommendations.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/presentation/home_screen.dart';
import 'package:coda/src/features/home/presentation/pitch_screen.dart';
import 'package:coda/src/features/library/presentation/library_screen.dart';
import 'package:coda/src/features/onboarding/presentation/onboarding_screen.dart';
import 'package:coda/src/features/onboarding/presentation/taste_profile_screen.dart';
import 'package:coda/src/features/session/presentation/current_session_screen.dart';
import 'package:coda/src/features/shell/presentation/coda_shell.dart';
import 'package:flutter/material.dart';
// import 'package:coda/src/core/providers/shared_preferences_provider.dart';
// import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final codaRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/onboarding',
  redirect: (context, state) {
    // try {
    //   final container = ProviderScope.containerOf(context);
    //   final prefs = container.read(sharedPreferencesProvider);
    //   final savedChips = prefs.getStringList('coda_onboarding_chips') ?? [];
    //   
    //   // Temporarily disabled auto-skip onboarding to allow previewing
    //   // if (savedChips.isNotEmpty && state.matchedLocation == '/onboarding') {
    //   //   return '/home';
    //   // }
    // } catch (e) {
    //   debugPrint('GoRouter redirect error: $e');
    // }
    return null;
  },
  routes: [
    GoRoute(path: '/', redirect: (context, state) => '/home'),
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) =>
          CodaShell(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/library',
              builder: (context, state) => const LibraryScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/home',
              builder: (context, state) => const HomeScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/ask',
              builder: (context, state) => const AskCodaScreen(),
            ),
          ],
        ),
      ],
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/onboarding',
      builder: (context, state) => const OnboardingScreen(),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/taste-profile',
      builder: (context, state) => const TasteProfileScreen(),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/session',
      builder: (context, state) => const CurrentSessionScreen(),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/pitch/:id',
      builder: (context, state) {
        final recommendation = state.extra as Recommendation?;
        if (recommendation == null) return const HomeScreen();
        return PitchScreen(recommendation: recommendation);
      },
    ),
  ],
);
