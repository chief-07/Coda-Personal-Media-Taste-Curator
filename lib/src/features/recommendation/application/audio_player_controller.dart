import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:coda/src/core/providers/shared_preferences_provider.dart';
import 'package:coda/src/features/home/application/home_recommendation_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

class AudioPlayerState {
  final bool isMuted;
  final bool isPlaying;
  final String? currentUrl;

  AudioPlayerState({
    required this.isMuted,
    required this.isPlaying,
    this.currentUrl,
  });

  AudioPlayerState copyWith({
    bool? isMuted,
    bool? isPlaying,
    String? currentUrl,
  }) {
    return AudioPlayerState(
      isMuted: isMuted ?? this.isMuted,
      isPlaying: isPlaying ?? this.isPlaying,
      currentUrl: currentUrl ?? this.currentUrl,
    );
  }
}

class AudioPlayerController extends Notifier<AudioPlayerState> {
  final _audioPlayer = AudioPlayer();
  static const _mutePrefsKey = 'coda_soundtracks_muted';

  final Map<String, BytesSource> _cachedSources = {};

  Duration? _currentDuration;
  StreamSubscription? _positionSubscription;
  StreamSubscription? _durationSubscription;

  Future<void> precacheAudio(String url) async {
    if (url.isEmpty || _cachedSources.containsKey(url)) return;
    try {
      print('[Audio Cache] Pre-fetching OST preview: $url');
      final res = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        _cachedSources[url] = BytesSource(res.bodyBytes);
        print('[Audio Cache] Successfully pre-fetched ${res.bodyBytes.length} bytes for $url');
      }
    } catch (e) {
      print('[Audio Cache Error] Pre-fetch failed for $url: $e');
    }
  }

  @override
  AudioPlayerState build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    final isMuted = prefs.getBool(_mutePrefsKey) ?? true; // Default to muted for auto-play compliance

    ref.listen(homeRecommendationProvider, (previous, next) {
      final rec = next.value;
      if (rec != null && rec.ostUrl != null && rec.ostUrl!.isNotEmpty) {
        _handleNewTrack(rec.ostUrl!);
      } else {
        _stopPlayback();
      }
    });

    // Load and play initial active recommendation soundtrack on startup if already present
    final initialRec = ref.read(homeRecommendationProvider).value;
    if (initialRec != null && initialRec.ostUrl != null && initialRec.ostUrl!.isNotEmpty) {
      Future.microtask(() => _handleNewTrack(initialRec.ostUrl!));
    }

    // Set up position & duration listeners for smooth fade-in/fade-out transitions
    _durationSubscription = _audioPlayer.onDurationChanged.listen((dur) {
      _currentDuration = dur;
    });

    _positionSubscription = _audioPlayer.onPositionChanged.listen((pos) {
      if (state.isMuted) return;
      
      final dur = _currentDuration ?? const Duration(seconds: 30);
      final durMs = dur.inMilliseconds;
      final posMs = pos.inMilliseconds;

      if (durMs > 0) {
        const fadeMs = 2000; // 2 seconds fade duration
        double volume = 0.06;

        if (posMs < fadeMs) {
          // Fade in smoothly from 0.0 to 0.06
          volume = (posMs / fadeMs) * 0.06;
        } else if (durMs - posMs < fadeMs) {
          // Fade out smoothly from 0.06 to 0.0
          volume = ((durMs - posMs) / fadeMs) * 0.06;
        }

        _audioPlayer.setVolume(volume.clamp(0.0, 0.06));
      }
    });

    // Cleanup player subscriptions when controller is disposed
    ref.onDispose(() {
      _positionSubscription?.cancel();
      _durationSubscription?.cancel();
      _audioPlayer.dispose();
    });

    return AudioPlayerState(
      isMuted: isMuted,
      isPlaying: false,
    );
  }

  Future<void> _handleNewTrack(String url) async {
    if (state.currentUrl == url) return;

    state = state.copyWith(currentUrl: url);

    try {
      await _audioPlayer.stop();
      await _audioPlayer.setReleaseMode(ReleaseMode.loop);
      
      // Set volume soft for ambient background music (initially 0.0, fader will handle fade-in)
      await _audioPlayer.setVolume(0.0);
      
      final source = _cachedSources[url] ?? UrlSource(url);
      await _audioPlayer.setSource(source);
      
      if (!state.isMuted) {
        await _audioPlayer.resume();
        state = state.copyWith(isPlaying: true);
      } else {
        state = state.copyWith(isPlaying: false);
      }
    } catch (e) {
      print('[AudioPlayer Error] Failed to load/play track $url: $e');
    }
  }

  Future<void> _stopPlayback() async {
    try {
      await _audioPlayer.stop();
      state = state.copyWith(isPlaying: false, currentUrl: null);
    } catch (e) {
      print('[AudioPlayer Error] Failed to stop playback: $e');
    }
  }

  Future<void> toggleMute() async {
    final newMute = !state.isMuted;
    
    // Unconditionally update UI state first so the button is always responsive
    state = state.copyWith(
      isMuted: newMute,
      isPlaying: newMute ? false : (state.currentUrl != null),
    );

    // Save to SharedPreferences safely
    try {
      final prefs = ref.read(sharedPreferencesProvider);
      await prefs.setBool(_mutePrefsKey, newMute);
    } catch (e) {
      print('[AudioPlayer Error] Failed to save mute preference: $e');
    }

    // Control audio player safely
    try {
      if (newMute) {
        await _audioPlayer.setVolume(0.0);
        await _audioPlayer.pause();
      } else {
        await _audioPlayer.setVolume(0.06);
        if (state.currentUrl != null) {
          // Re-set source to force load under active user interaction context to bypass browser autoplay blocks
          final source = _cachedSources[state.currentUrl!] ?? UrlSource(state.currentUrl!);
          await _audioPlayer.setSource(source);
          await _audioPlayer.resume();
        }
      }
    } catch (e) {
      print('[AudioPlayer Error] Player control failed during mute toggle: $e');
    }
  }

  Future<void> pause() async {
    if (!state.isPlaying) return;
    try {
      await _audioPlayer.pause();
      state = state.copyWith(isPlaying: false);
    } catch (e) {
      print('[AudioPlayer Error] Failed to pause: $e');
    }
  }

  Future<void> resume() async {
    if (state.isPlaying || state.isMuted || state.currentUrl == null) return;
    try {
      await _audioPlayer.resume();
      state = state.copyWith(isPlaying: true);
    } catch (e) {
      print('[AudioPlayer Error] Failed to resume: $e');
    }
  }
}

final audioPlayerControllerProvider = NotifierProvider<AudioPlayerController, AudioPlayerState>(
  AudioPlayerController.new,
);
