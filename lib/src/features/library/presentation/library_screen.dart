import 'package:flutter/material.dart';

class LibraryScreen extends StatelessWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.bookmark_border, size: 32),
              const SizedBox(height: 20),
              Text(
                'Your list',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Saved picks will live here, and Coda can pull from them when one finally feels right.',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  height: 1.45,
                  color: Theme.of(
                    context,
                  ).colorScheme.onSurface.withValues(alpha: 0.68),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
