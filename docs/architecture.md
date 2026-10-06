# Coda Architecture

**Coda** is an intentional personal media taste curator built with a **Flutter** frontend (Web & Mobile PWA) and a **Node.js / Express** backend powered by **Walrus Protocol Memory (`@mysten-incubation/memwal`)**, **Google Gemini (`gemini-3.1-flash-lite`)**, and **Groq (`qwen/qwen3.8-27b` & `whisper-large-v3`)**.

## 1. Frontend Layers (`lib/src/`)

- `lib/src/app`: App bootstrapping, GoRouter navigation, and top-level theme configuration.
- `lib/src/core`:
  - `memory/living_memory.dart`: Local state synchronization and Walrus write/recall provenance DTOs.
  - `providers/user_id_provider.dart`: Multi-account management, per-account state snapshotting, and `X-Coda-Token` identity credential generation (`userTokenProvider`).
- `lib/src/features`:
  - `onboarding`: Conversational format discovery and 4-milestone taste extraction (`TasteProfileScreen`) that seals atomic facts to Walrus Mainnet.
  - `home`: Single-pick glassmorphic recommendation card with 3-line knockout fade, automatic OST playback, inline trailer preview, swipe handlers (**Loved It**, **Already Seen**, **Not For Me** + custom feedback prompt box), **Personal Letter of Recommendation** (`PitchScreen`), and the frosted-glass **Walrus Provenance Sheet** (`walrus_memory_sheet.dart`).
  - `ask`: Direct natural-language curation & vibe-check conversation (`AskCodaScreen`).
  - `session`: Active viewing/playing/reading companion and post-session reflection chat (`SessionCompletionChatScreen`).
  - `library`: Watchlist, completed session archive, **Memories ON/OFF (Amnesia Mode)** toggle, and **Account Switcher** (`AccountScreen`).

## 2. Backend & Walrus Memory Engine (`backend/`)

- `middleware/userAuth.js`: Per-account token verification (`verifyUserIdentity`) validating `userId` format and binding `userId` to `X-Coda-Token` (`HMAC-SHA256`).
- `services/walrusMemoryService.js`:
  - **Namespace-Partitioned Storage**: Organizes each user's memories under `coda:<userId>:core`, `coda:<userId>:<category>`, `coda:<userId>:guardrails`, and `coda:<userId>:session` on Walrus Mainnet (`0x48b30fecc266bef51e01ae32c4f610bbe2910ed09a4c022e27383999aa331d55`).
  - **Atomic Fact Decomposition**: Splits multi-part taste updates into self-contained atomic facts before calling `client.remember()`.
  - **4 Genre-Neutral Probes & Soul Traversal**: Queries `:core` and `:<category>` with rotated probes, spotlights 1 `:core` facet + 1 `:<category>` anchor per recommendation, applies `:session` cravings only when semantically close (`distance <= 0.62`), and enforces the full `:guardrails` namespace (`limit: 50`).
  - **Write-Through Provenance Cache**: Bridges Walrus's async batch sealing (`202 Accepted`) with immediate next-turn recall while resolving pending `job_id`s to permanent `blob_id`s via `getRememberBulkStatus()`.
- `services/geminiClient.js` & `services/llmService.js`: Google Gemini (`gemini-3.1-flash-lite`) and Groq (`qwen/qwen3.8-27b`) reasoning and curation pipeline.
- `services/mediaService.js` & `services/searchService.js`: Multi-source poster, trailer, and soundtrack (OST) resolution across TMDB, OMDb, AniList, MangaDex, Steam, Google Books, iTunes, and YouTube.
