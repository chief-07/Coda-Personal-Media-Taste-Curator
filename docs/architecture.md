# Coda Architecture

Coda is a mobile-first Flutter app with a feature-first structure. The app should keep presentation, product state, and recommendation intelligence separated so the recommendation engine can evolve without rewriting the mobile client.

## App Layers

- `lib/src/app`: app bootstrapping, router, and top-level configuration.
- `lib/src/core`: shared theme, utilities, API clients, persistence, and platform services.
- `lib/src/features`: user-facing product areas, each with `domain`, `data`, `application`, and `presentation` folders as needed.

## Current Features

- `home`: one intentional recommendation, currently backed by mock data.
- `ask`: direct natural-language recommendation requests.
- `library`: saved items and watchlist.
- `session`: the committed "currently watching/playing/reading" flow.
- `onboarding`: taste-building chat entry point.

## Recommendation Boundary

The Flutter app should not own the recommendation algorithm. It should call a backend recommendation service that owns:

- taste profile extraction and updates
- media candidate retrieval
- web/community evidence collection
- ranking and anti-blandness filtering
- final LLM reasoning and Coda voice

The mobile app should receive a prepared home pick with metadata, source-backed reasons, and actions the user can take.
