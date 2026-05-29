import 'package:flutter/material.dart';

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Taste profile')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              'Let Coda learn what actually stays with you.',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w800,
                height: 1.05,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'This will become a chat, not a form: favorite things, hard dislikes, moods, character dynamics, and the kind of emotional residue you want from media.',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                height: 1.45,
                color: Theme.of(
                  context,
                ).colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 28),
            FilledButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.auto_awesome),
              label: const Text('Start taste chat'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.arrow_back),
              label: const Text('Back to today’s pick'),
            ),
          ],
        ),
      ),
    );
  }
}
