import 'dart:ui' as dart_ui;
import 'package:coda/src/features/ask/presentation/ask_coda_screen.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:coda/src/features/home/presentation/home_screen.dart';
import 'package:coda/src/features/home/presentation/pitch_screen.dart';
import 'package:coda/src/features/home/presentation/media_detail_screen.dart';
import 'package:coda/src/features/library/presentation/library_screen.dart';
import 'package:coda/src/features/library/presentation/memories_screen.dart';
import 'package:coda/src/features/library/presentation/share_receive_screen.dart';
import 'package:coda/src/features/onboarding/presentation/onboarding_screen.dart';
import 'package:coda/src/features/onboarding/presentation/taste_profile_screen.dart';
import 'package:coda/src/features/session/presentation/current_session_screen.dart';
import 'package:coda/src/features/session/presentation/session_completion_chat_screen.dart';
import 'package:coda/src/features/shell/presentation/coda_shell.dart';
import 'package:coda/src/features/library/presentation/account_screen.dart';
import 'package:coda/src/features/library/presentation/support_coda_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
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

      final isCreatingNewAccount =
          prefs.getBool('coda_creating_new_account') == true ||
          state.uri.queryParameters['newAccount'] == 'true';
      final onboardingCompleted = !isCreatingNewAccount &&
          (prefs.getBool('coda_onboarding_completed') == true);
      final isGoingToOnboarding = state.matchedLocation == '/onboarding' || state.matchedLocation == '/taste-profile';
      final isGoingToShareReceive = state.matchedLocation == '/share-receive';
      
      // If user has not completed onboarding, keep them in onboarding
      if (!onboardingCompleted && !isGoingToOnboarding && !isGoingToShareReceive) {
        return '/onboarding';
      }
      // Fully onboarded user trying to access onboarding screens: send to home (or session if active)
      if (onboardingCompleted && isGoingToOnboarding) {
        final hasActiveSession = prefs.getString('coda_active_session_recommendation') != null;
        return hasActiveSession ? '/session' : '/home';
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
      ],
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/ask',
      pageBuilder: (context, state) => buildCardSlideUpTransitionPage(
        context: context,
        state: state,
        child: const AskCodaScreen(),
      ),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/onboarding',
      builder: (context, state) => const OnboardingScreen(),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/taste-profile',
      builder: (context, state) {
        final customCategory = state.uri.queryParameters['customCategory'];
        return TasteProfileScreen(customCategory: customCategory);
      },
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/session',
      pageBuilder: (context, state) => CustomTransitionPage<dynamic>(
        key: state.pageKey,
        child: const CurrentSessionScreen(),
        transitionDuration: const Duration(milliseconds: 350),
        reverseTransitionDuration: const Duration(milliseconds: 250),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(
            opacity: animation,
            child: child,
          );
        },
      ),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/session-chat',
      builder: (context, state) {
        final sessionId = state.uri.queryParameters['id'];
        return SessionCompletionChatScreen(sessionId: sessionId);
      },
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/memories',
      pageBuilder: (context, state) {
        final tabStr = state.uri.queryParameters['tab'];
        final initialTab = int.tryParse(tabStr ?? '0') ?? 0;
        return buildCardSlideUpTransitionPage(
          context: context,
          state: state,
          child: MemoriesScreen(initialTab: initialTab),
        );
      },
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/detail/:id',
      pageBuilder: (context, state) {
        final recommendation = state.extra as Recommendation?;
        final child = recommendation == null
            ? const HomeScreen()
            : MediaDetailScreen(recommendation: recommendation);
        return buildCardSlideUpTransitionPage(
          context: context,
          state: state,
          child: child,
        );
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
      pageBuilder: (context, state) {
        final recommendation = state.extra as Recommendation?;
        final child = recommendation == null
            ? const HomeScreen()
            : PitchScreen(recommendation: recommendation);
        return buildCardSlideUpTransitionPage(
          context: context,
          state: state,
          child: child,
        );
      },
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/account',
      pageBuilder: (context, state) => buildCardSlideUpTransitionPage(
        context: context,
        state: state,
        child: const AccountScreen(),
      ),
    ),
    GoRoute(
      parentNavigatorKey: _rootNavigatorKey,
      path: '/support-coda',
      pageBuilder: (context, state) => buildCardSlideUpTransitionPage(
        context: context,
        state: state,
        child: const SupportCodaScreen(),
      ),
    ),
  ],
);

Page<dynamic> buildCardSlideUpTransitionPage({
  required BuildContext context,
  required GoRouterState state,
  required Widget child,
}) {
  return CustomTransitionPage<dynamic>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 450),
    reverseTransitionDuration: const Duration(milliseconds: 300),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          final double t = animation.value;

          // Split animation into 2 phases:
          // Phase 1: 0.0 -> 0.4 (card slides up to cover top)
          // Phase 2: 0.4 -> 1.0 (content fade-blurs in)
          double phase1 = 0.0;
          double phase2 = 0.0;

          if (t < 0.4) {
            phase1 = t / 0.4;
          } else {
            phase1 = 1.0;
            phase2 = (t - 0.4) / 0.6;
          }

          // Top boundary moves from 105 to 0
          final double topOffset = (1.0 - phase1) * 105.0;
          // Rounded corners go from 64 to 0
          final double borderRadius = (1.0 - phase1) * 64.0;

          // Content blur goes from 15.0 to 0.0
          final double contentBlur = kIsWeb ? 0.0 : (1.0 - phase2) * 15.0;
          final double contentOpacity = phase2;

          Widget content = child;
          if (contentBlur > 0.1) {
            content = ImageFiltered(
              imageFilter: dart_ui.ImageFilter.blur(sigmaX: contentBlur, sigmaY: contentBlur),
              child: content,
            );
          }
          content = Opacity(
            opacity: contentOpacity,
            child: content,
          );

          return Stack(
            children: [
              Positioned(
                top: topOffset,
                left: 0,
                right: 0,
                bottom: 0,
                child: ClipRRect(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(borderRadius)),
                  child: Container(
                    decoration: const BoxDecoration(
                      color: Color(0xFF101114), // Base dark card color
                    ),
                    child: content,
                  ),
                ),
              ),
            ],
          );
        },
      );
    },
  );
}
