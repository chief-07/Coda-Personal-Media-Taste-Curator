import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/home/domain/recommendation.dart' as coda_domain;
import 'package:coda/src/features/home/domain/media_type.dart' as coda_domain;
import 'package:coda/src/core/providers/api_config.dart';
import 'package:coda/src/core/providers/user_id_provider.dart';

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

final recommendationServiceProvider = Provider<RecommendationService>((ref) {
  final userId = ref.watch(userIdProvider);
  return RecommendationService(userId: userId);
});

class RecommendationService {
  final String userId;

  RecommendationService({required this.userId});

  static String get _baseUrl => '${getApiBaseUrl()}/api/recommend';

  /// Fetches recommendations using the user's Living Memory and current environmental context
  Future<List<RecommendationResult>> fetchRecommendations(
    LivingMemory memory, 
    coda_domain.MediaType selectedMediaType, {
    List<String> additionalExclusions = const [],
    int limit = 1,
    bool watchlistOnly = false,
    String? ambientContext,
  }) async {
    // Build seen list including exclusions
    final finalSeen = List<String>.from(memory.seen);
    for (final title in additionalExclusions) {
      if (!finalSeen.contains(title)) finalSeen.add(title);
    }
    final fallbackMemory = memory.toJson();
    fallbackMemory['seen'] = finalSeen;

    final payload = {
      'userId': userId,
      'requested_media_type': selectedMediaType.name, // The user explicitly tapped this tab
      'current_memory': fallbackMemory,
      if (ambientContext != null) 'contextualState': ambientContext,
      'limit': limit,
      'watchlist_only': watchlistOnly,
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
      'userId': userId,
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

  Future<Map<String, dynamic>> fetchPitch({
    required LivingMemory memory,
    required String title,
    required String mediaType,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('${getApiBaseUrl()}/api/recommend/pitch'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'title': title,
          'requested_media_type': mediaType,
          'userId': memory.globalIdentity.isNotEmpty ? 'coda_user' : null,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final paragraphs = (data['pitch_paragraphs'] as List?)?.map((e) => e.toString()).toList() ?? [];
        final blurb = data['coda_blurb'] as String? ?? '';
        return {
          'pitch_paragraphs': paragraphs,
          'coda_blurb': blurb
        };
      }
      return {'pitch_paragraphs': <String>[], 'coda_blurb': ''};
    } catch (e) {
      print("Pitch generation error: $e");
      return {'pitch_paragraphs': <String>[], 'coda_blurb': ''};
    }
  }

  /// Sends a message in the Ask Coda conversational flow.
  /// Returns { status: "chatting"|"success", message: String, recommendation: Map? }
  Future<Map<String, dynamic>> sendAskChatMessage({
    required LivingMemory memory,
    required List<Map<String, dynamic>> chatHistory,
    required String userMessage,
    bool watchlistOnly = false,
  }) async {
    final payload = {
      'userId': userId,
      'current_memory': memory.toJson(),
      'chat_history': chatHistory,
      'user_message': userMessage,
      'watchlist_only': watchlistOnly,
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
      'userId': userId,
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
      'userId': userId,
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

class VibeCheckResult {
  final bool? isMatch;
  final String convictionStatement;

  const VibeCheckResult({
    required this.isMatch,
    required this.convictionStatement,
  });

  factory VibeCheckResult.fromJson(Map<String, dynamic> json) {
    return VibeCheckResult(
      isMatch: json['is_match'] as bool?,
      convictionStatement: json['conviction_statement'] as String? ?? 'Hmm, I am not sure.',
    );
  }
}

extension RecommendationServiceMatch on RecommendationService {
  Future<VibeCheckResult> vibeCheck({
    required String title,
    required LivingMemory memory,
  }) async {
    final payload = {
      'title': title,
      'userId': userId,
      'current_memory': memory.toJson(),
    };

    final targetUrl = '${getApiBaseUrl()}/api/recommend/vibe-check';

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        return VibeCheckResult.fromJson(jsonDecode(response.body));
      } else {
        throw Exception('Vibe check failed: ${response.statusCode}');
      }
    } catch (e) {
      print("Vibe check error: $e");
      return const VibeCheckResult(
        isMatch: null,
        convictionStatement: "I'm having trouble connecting right now. Let's try again in a bit.",
      );
    }
  }

  Future<coda_domain.Recommendation?> promoteMedia({
    required String title,
    required LivingMemory memory,
  }) async {
    final payload = {
      'title': title,
      'current_memory': memory.toJson(),
    };

    final targetUrl = '${getApiBaseUrl()}/api/recommend/promote';

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        // Accept 'success' and 'promoted_synthetic' (and any future status) as long as recommendation is present
        if (data['recommendation'] != null) {
          final result = RecommendationResult.fromJson(data['recommendation']);
          return result.toDomain();
        }
      }
      return null;
    } catch (e) {
      print("Promote error: $e");
      return null;
    }
  }

  Future<void> submitSwipe({
    required String title,
    required String action, // 'loved', 'not_for_me', 'seen'
  }) async {
    try {
      await http.post(
        Uri.parse('${getApiBaseUrl()}/api/recommend/swipe'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': userId,
          'title': title,
          'action': action,
        }),
      );
    } catch (e) {
      print("Submit swipe error: $e");
    }
  }
}
