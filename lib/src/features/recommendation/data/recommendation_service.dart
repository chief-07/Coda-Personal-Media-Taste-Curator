import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/domain/recommendation.dart' as coda_domain;
import 'package:coda/src/features/home/domain/media_type.dart' as coda_domain;
import 'package:coda/src/core/providers/api_config.dart';

class RecommendationResult {
  final String title;
  final String mediaType;
  final String codaBlurb;
  final List<String> pitchParagraphs;
  final String posterUrl;
  final String ostUrl;
  final String trailerUrl;
  final String description;
  final List<String> genres;
  final List<String> tags;
  final String releaseYear;
  final String studio;

  RecommendationResult({
    required this.title,
    required this.mediaType,
    required this.codaBlurb,
    required this.pitchParagraphs,
    required this.posterUrl,
    required this.ostUrl,
    required this.trailerUrl,
    required this.description,
    required this.genres,
    required this.tags,
    required this.releaseYear,
    required this.studio,
  });

  factory RecommendationResult.fromJson(Map<String, dynamic> json) {
    String rawPoster = json['poster_url'] ?? '';
    if (rawPoster.startsWith('/')) {
      final baseHost = getApiBaseUrl();
      rawPoster = '$baseHost$rawPoster';
    }
    return RecommendationResult(
      title: json['title'] ?? 'Unknown',
      mediaType: json['media_type'] ?? 'unknown',
      codaBlurb: json['coda_blurb'] ?? '',
      pitchParagraphs: List<String>.from(json['pitch_paragraphs'] ?? []),
      posterUrl: rawPoster,
      ostUrl: json['ost_url'] ?? '',
      trailerUrl: json['trailer_url'] ?? '',
      description: json['description'] ?? '',
      genres: List<String>.from(json['genres'] ?? []),
      tags: List<String>.from(json['tags'] ?? []),
      releaseYear: json['release_year'] ?? '',
      studio: json['studio'] ?? '',
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
      orElse: () {
        final label = mediaType.isEmpty
            ? 'Custom'
            : mediaType[0].toUpperCase() + mediaType.substring(1);
        return coda_domain.MediaType.custom(label);
      },
    );

    return coda_domain.Recommendation(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      title: title,
      mediaType: typeEnum,
      codaBlurb: codaBlurb,
      pitch: pitchParagraphs,
      posterUrl: posterUrl.isNotEmpty ? posterUrl : null,
      ostUrl: ostUrl.isNotEmpty ? ostUrl : null,
      trailerUrl: trailerUrl.isNotEmpty ? trailerUrl : null,
      codaNote: "I picked this based on everything we've talked about.",
      description: description.isNotEmpty ? description : title,
      genres: genres,
      tags: tags,
      fitSignals: ['Perfect for your current mood'],
      posterGradient: [const Color(0xFF2B5876), const Color(0xFF4E4376)],
      releaseYear: releaseYear,
      studio: studio,
    );
  }
}

class RecommendationService {
  static String get _baseUrl => '${getApiBaseUrl()}/api/recommend';

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
    String cleanKey = selectedMediaType.name;
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
      default:
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
      'watchlist': memory.watchlist.map((e) => e.toJson()).toList(),
    };

    final targetUrl = _baseUrl;

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

    final targetUrl = '${getApiBaseUrl()}/api/recommend/feedback';

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

    final targetUrl = '${getApiBaseUrl()}/api/recommend/pitch';

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

  /// Sends a message in the Ask Coda conversational flow.
  /// Returns { status: "chatting"|"success", message: String, recommendation: Map? }
  Future<Map<String, dynamic>> sendAskChatMessage({
    required LivingMemory memory,
    required List<Map<String, dynamic>> chatHistory,
    required String userMessage,
  }) async {
    final payload = {
      'current_memory': memory.toJson(),
      'chat_history': chatHistory,
      'user_message': userMessage,
    };

    final targetUrl = '${getApiBaseUrl()}/api/recommend/ask';

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      } else {
        throw Exception('Ask Coda failed: ${response.statusCode}');
      }
    } catch (e) {
      print("Ask Coda network error: $e");
      return {
        'status': 'chatting',
        'message': "Hmm, I'm having trouble connecting right now. Let's try again in a bit.",
        'recommendation': null,
      };
    }
  }

  /// Discusses a recommendation with Coda
  Future<String> discussRecommendation({
    required LivingMemory memory,
    required String title,
    required String mediaType,
    required String codaBlurb,
    required List<String> pitchParagraphs,
    required List<Map<String, dynamic>> chatHistory,
    required String userMessage,
  }) async {
    final payload = {
      'current_memory': memory.toJson(),
      'title': title,
      'media_type': mediaType,
      'coda_blurb': codaBlurb,
      'pitch_paragraphs': pitchParagraphs,
      'chat_history': chatHistory,
      'user_message': userMessage,
    };

    final targetUrl = '${getApiBaseUrl()}/api/recommend/chat';

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['message'] ?? "I'm not sure how to respond to that.";
      } else {
        throw Exception('Failed to get chat response: ${response.statusCode}');
      }
    } catch (e) {
      print("Chat network error: $e");
      return "Hmm, I'm having trouble connecting right now. Let's try again in a bit.";
    }
  }

  /// Discusses a recommendation with Coda and retrieves experience summaries and memory refinements
  Future<DiscussResult> discussRecommendationWithRefinements({
    required LivingMemory memory,
    required String title,
    required String mediaType,
    required String codaBlurb,
    required List<String> pitchParagraphs,
    required List<Map<String, dynamic>> chatHistory,
    required String userMessage,
  }) async {
    final payload = {
      'current_memory': memory.toJson(),
      'title': title,
      'media_type': mediaType,
      'coda_blurb': codaBlurb,
      'pitch_paragraphs': pitchParagraphs,
      'chat_history': chatHistory,
      'user_message': userMessage,
    };

    final targetUrl = '${getApiBaseUrl()}/api/recommend/chat';

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final message = data['message'] ?? "I'm not sure how to respond to that.";
        final oneLineSummary = data['one_line_summary'] as String?;
        final updatesJson = data['memory_updates'];
        final memoryUpdates = updatesJson != null ? MemoryUpdates.fromJson(updatesJson) : null;

        return DiscussResult(
          message: message,
          oneLineSummary: oneLineSummary,
          memoryUpdates: memoryUpdates,
        );
      } else {
        throw Exception('Failed to get chat response: ${response.statusCode}');
      }
    } catch (e) {
      print("Chat network error: $e");
      return DiscussResult(
        message: "Hmm, I'm having trouble connecting right now. Let's try again in a bit.",
      );
    }
  }
}

class DiscussResult {
  final String message;
  final String? oneLineSummary;
  final MemoryUpdates? memoryUpdates;

  DiscussResult({
    required this.message,
    this.oneLineSummary,
    this.memoryUpdates,
  });
}
