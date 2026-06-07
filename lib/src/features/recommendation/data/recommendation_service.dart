import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/domain/recommendation.dart' as coda_domain;
import 'package:coda/src/features/home/domain/media_type.dart' as coda_domain;

class RecommendationResult {
  final String title;
  final String mediaType;
  final String codaBlurb;
  final List<String> pitchParagraphs;
  final String posterUrl;
  final String ostUrl;

  RecommendationResult({
    required this.title,
    required this.mediaType,
    required this.codaBlurb,
    required this.pitchParagraphs,
    required this.posterUrl,
    required this.ostUrl,
  });

  factory RecommendationResult.fromJson(Map<String, dynamic> json) {
    String rawPoster = json['poster_url'] ?? '';
    if (rawPoster.startsWith('/')) {
      final baseHost = kIsWeb ? Uri.base.origin : 'http://localhost:8080';
      rawPoster = '$baseHost$rawPoster';
    }
    return RecommendationResult(
      title: json['title'] ?? 'Unknown',
      mediaType: json['media_type'] ?? 'unknown',
      codaBlurb: json['coda_blurb'] ?? '',
      pitchParagraphs: List<String>.from(json['pitch_paragraphs'] ?? []),
      posterUrl: rawPoster,
      ostUrl: json['ost_url'] ?? '',
    );
  }

  // Mapper to the Domain model
  coda_domain.Recommendation toDomain() {
    final typeEnum = coda_domain.MediaType.values.firstWhere(
      (e) {
        final normalizedEnumName = e.name.replaceAll(RegExp(r'[\s_\-]'), '').toLowerCase();
        final normalizedMediaType = mediaType.replaceAll(RegExp(r'[\s_\-]'), '').toLowerCase();
        return normalizedEnumName == normalizedMediaType;
      },
      orElse: () => coda_domain.MediaType.movie,
    );

    return coda_domain.Recommendation(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      title: title,
      mediaType: typeEnum,
      codaBlurb: codaBlurb,
      pitch: pitchParagraphs,
      posterUrl: posterUrl.isNotEmpty ? posterUrl : null,
      
      // The Engine doesn't return these yet, so provide defaults
      codaNote: "I picked this based on everything we've talked about.",
      description: title,
      genres: [],
      tags: [],
      fitSignals: ['Perfect for your current mood'],
      posterGradient: [const Color(0xFF2B5876), const Color(0xFF4E4376)],
      releaseYear: '',
    );
  }
}

class RecommendationService {
  static const String _baseUrl = 'http://localhost:8080/api/recommend';

  /// Fetches recommendations using the user's Living Memory and current environmental context
  Future<List<RecommendationResult>> fetchRecommendations(
    LivingMemory memory, 
    coda_domain.MediaType selectedMediaType, {
    List<String> additionalExclusions = const [],
  }) async {
    final now = DateTime.now();
    final hour = now.hour;
    
    // Simple heuristic for time of day
    String timeOfDay = 'evening';
    if (hour >= 5 && hour < 12) {
      timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17 && hour < 21) {
      timeOfDay = 'evening';
    } else {
      timeOfDay = 'late night';
    }

    // In a full app, we could add weather or season here.
    final localContext = 'It is currently a $timeOfDay on a ${now.weekday == 6 || now.weekday == 7 ? 'weekend' : 'weekday'}.';

    // Format the living memory for the LLM (The "You" store)
    final coreIdentity = memory.globalIdentity.join('. ');

    // Normalize selectedMediaType name to find specific category profile key
    String cleanKey;
    switch (selectedMediaType) {
      case coda_domain.MediaType.anime:
        cleanKey = 'anime';
        break;
      case coda_domain.MediaType.movie:
        cleanKey = 'movies';
        break;
      case coda_domain.MediaType.tv:
        cleanKey = 'tv_shows';
        break;
      case coda_domain.MediaType.visualNovel:
        cleanKey = 'visual_novels';
        break;
      case coda_domain.MediaType.manga:
        cleanKey = 'manga';
        break;
      case coda_domain.MediaType.book:
        cleanKey = 'books';
        break;
      case coda_domain.MediaType.game:
        cleanKey = 'games';
        break;
      case coda_domain.MediaType.youtube:
        cleanKey = 'youtube';
        break;
      case coda_domain.MediaType.music:
        cleanKey = 'music';
        break;
    }

    // Isolate context: only pass the "You" store and the profile of the requested media type
    final specificTastes = memory.categoryProfiles[cleanKey] ?? [];
    final specificTastesStr = specificTastes.isEmpty ? 'None' : specificTastes.join('. ');
    final fullCoreIdentity = '$coreIdentity. Specific Tastes in ${selectedMediaType.label}: $specificTastesStr';
    
    final guardrails = memory.guardrails.join(', ');

    // Build seen list including exclusions
    final finalSeen = List<String>.from(memory.seen);
    for (final title in additionalExclusions) {
      if (!finalSeen.contains(title)) finalSeen.add(title);
    }

    final payload = {
      'core_identity': fullCoreIdentity,
      'recent_context': memory.recentContext,
      'guardrails': guardrails,
      'local_context': localContext,
      'requested_media_type': selectedMediaType.name, // The user explicitly tapped this tab
      'seen': finalSeen,
      'not_for_me': memory.notForMe,
    };

    final targetUrl = kIsWeb ? '${Uri.base.origin}/api/recommend' : _baseUrl;

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        final Map<String, dynamic> jsonMap = jsonDecode(response.body);
        final recommendationsList = jsonMap['recommendations'] as List?;
        if (recommendationsList != null) {
          return recommendationsList.map((item) => RecommendationResult.fromJson(item)).toList();
        }
        // Fallback for backward compatibility
        return [RecommendationResult.fromJson(jsonMap)];
      } else {
        throw Exception('Failed to fetch recommendations: ${response.statusCode}');
      }
    } catch (e) {
      print("Recommendation network error: $e");
      throw Exception('Could not connect to recommendation engine.');
    }
  }

  /// Sends feedback for a rejected recommendation to refine the profile
  Future<MemoryUpdates?> refineTaste({
    required LivingMemory memory,
    required String title,
    required String mediaType,
    required String reason,
  }) async {
    final payload = {
      'current_memory': memory.toJson(),
      'recommendation_title': title,
      'media_type': mediaType,
      'feedback_reason': reason,
    };

    final targetUrl = kIsWeb 
        ? '${Uri.base.origin}/api/recommend/feedback' 
        : _baseUrl.replaceAll('/recommend', '/recommend/feedback');

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        return MemoryUpdates.fromJson(jsonDecode(response.body));
      } else {
        throw Exception('Failed to refine taste: ${response.statusCode}');
      }
    } catch (e) {
      print("Feedback network error: $e");
      return null;
    }
  }

  /// Fetches the lazy pitch paragraphs for a recommendation
  Future<List<String>> fetchPitch({
    required LivingMemory memory,
    required String title,
    required String mediaType,
  }) async {
    final coreIdentity = memory.globalIdentity.join('. ');
    String cleanKey;
    switch (mediaType) {
      case 'anime': cleanKey = 'anime'; break;
      case 'movie': cleanKey = 'movies'; break;
      case 'tv': cleanKey = 'tv_shows'; break;
      case 'visualNovel': cleanKey = 'visual_novels'; break;
      case 'manga': cleanKey = 'manga'; break;
      case 'book': cleanKey = 'books'; break;
      case 'game': cleanKey = 'games'; break;
      case 'youtube': cleanKey = 'youtube'; break;
      case 'music': cleanKey = 'music'; break;
      default: cleanKey = mediaType;
    }
    final specificTastes = memory.categoryProfiles[cleanKey] ?? [];
    final specificTastesStr = specificTastes.isEmpty ? 'None' : specificTastes.join('. ');
    final fullCoreIdentity = '$coreIdentity. Specific Tastes in $mediaType: $specificTastesStr';
    final guardrails = memory.guardrails.join(', ');

    final payload = {
      'core_identity': fullCoreIdentity,
      'recent_context': memory.recentContext,
      'guardrails': guardrails,
      'title': title,
      'requested_media_type': mediaType,
      'seen': memory.seen,
      'not_for_me': memory.notForMe,
    };

    final targetUrl = kIsWeb 
        ? '${Uri.base.origin}/api/recommend/pitch' 
        : _baseUrl.replaceAll('/recommend', '/pitch');

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return List<String>.from(data['pitch_paragraphs'] ?? []);
      } else {
        throw Exception('Failed to fetch pitch: ${response.statusCode}');
      }
    } catch (e) {
      print("Pitch fetch network error: $e");
      return [];
    }
  }
}
