import 'dart:async';
import 'package:coda/src/features/ask/presentation/ask_coda_screen.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/presentation/home_screen.dart';
import 'package:coda/src/features/home/presentation/pitch_screen.dart';
import 'package:coda/src/features/home/presentation/media_detail_screen.dart';
import 'package:coda/src/features/library/presentation/library_screen.dart';
import 'package:coda/src/features/library/presentation/share_receive_screen.dart';
import 'package:coda/src/features/onboarding/presentation/onboarding_screen.dart';
import 'package:coda/src/features/onboarding/presentation/taste_profile_screen.dart';
import 'package:coda/src/features/session/presentation/current_session_screen.dart';
import 'package:coda/src/features/session/presentation/session_completion_chat_screen.dart';
import 'package:coda/src/features/shell/presentation/coda_shell.dart';
import 'package:flutter/material.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final codaRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/onboarding',
  redirect: (context, state) {
    try {
      final container = ProviderScope.containerOf(context);
      final prefs = container.read(sharedPreferencesProvider);
      final hasMemory = prefs.getString('living_memory_v1') != null;

      // Backward-compat: users who onboarded before the coda_onboarding_completed flag existed
      // still have living_memory_v1. Treat them as completed and lazily backfill the flag.
      final flagExplicitlySet = prefs.getBool('coda_onboarding_completed') == true;
      final isGoingToOnboarding = state.matchedLocation == '/onboarding' || state.matchedLocation == '/taste-profile';
      final onboardingCompleted = flagExplicitlySet || (hasMemory && !isGoingToOnboarding);
      // Backfill for existing users so the flag is set going forward
      if (hasMemory && !flagExplicitlySet) {
        scheduleMicrotask(() => prefs.setBool('coda_onboarding_completed', true));
      }
      final isGoingToShareReceive = state.matchedLocation == '/share-receive';
      
      // New users without any memory: send to onboarding
      if (!hasMemory && !isGoingToOnboarding && !isGoingToShareReceive) {
        return '/onboarding';
      }
      // Fully onboarded user trying to access onboarding screens: send to home
      if (onboardingCompleted && isGoingToOnboarding) {
        return '/home';
      }
    } catch (e) {
      debugPrint('GoRouter redirect error: $e');
    }
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
      path: '/session-chat',
      builder: (context, state) => const SessionCompletionChatScreen(),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/detail/:id',
      builder: (context, state) {
        final recommendation = state.extra as Recommendation?;
        if (recommendation == null) return const HomeScreen();
        return MediaDetailScreen(recommendation: recommendation);
      },
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/share-receive',
      builder: (context, state) {
        final title = state.uri.queryParameters['title'] ?? '';
        final mediaType = state.uri.queryParameters['media_type'] ?? '';
        final tagsStr = state.uri.queryParameters['tags'] ?? '[]';
        final description = state.uri.queryParameters['description'] ?? '';
        final codaBlurb = state.uri.queryParameters['coda_blurb'] ?? '';
        final posterUrl = state.uri.queryParameters['poster_url'] ?? '';
        final ostUrl = state.uri.queryParameters['ost_url'] ?? '';
        final error = state.uri.queryParameters['error'];
        final itemsStr = state.uri.queryParameters['items'];

        return ShareReceiveScreen(
          title: title,
          mediaType: mediaType,
          tagsStr: tagsStr,
          description: description,
          codaBlurb: codaBlurb,
          posterUrl: posterUrl,
          ostUrl: ostUrl,
          error: error,
          itemsStr: itemsStr,
        );
      },
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
