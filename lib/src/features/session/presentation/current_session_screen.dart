import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class CurrentSessionScreen extends ConsumerWidget {
  const CurrentSessionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recommendation =
        ref.watch(activeSessionProvider) ??
        ref.watch(homeRecommendationProvider);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.play_circle_outline, size: 34),
              const SizedBox(height: 20),
              Text(
                'Currently with',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.62),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                recommendation?.title ?? 'Nothing yet',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  height: 1.05,
                ),
              ),
              const Spacer(),
              FilledButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.forum_outlined),
                label: const Text('I am finished, let us talk'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
