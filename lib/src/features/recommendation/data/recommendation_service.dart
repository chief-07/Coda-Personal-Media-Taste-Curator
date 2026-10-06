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
  final List<Map<String, dynamic>> recalledMemories;
  final String? queryUsed;
  final String? moodAngle;
  final String? attributedMemory;

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
    this.recalledMemories = const [],
    this.queryUsed,
    this.moodAngle,
    this.attributedMemory,
  });

  factory RecommendationResult.fromJson(Map<String, dynamic> json) {
    String rawPoster = json['poster_url'] ?? '';
    if (rawPoster.startsWith('/')) {
      final baseHost = getApiBaseUrl();
      rawPoster = '$baseHost$rawPoster';
    }

    final rawBlurb = (json['coda_blurb'] ?? json['codaBlurb'] ?? '') as String;
    final cleanBlurb = rawBlurb.replaceAll('**', '').replaceAll('*', '').trim();

    final rawPitch = (json['pitch_paragraphs'] ?? json['pitch'] ?? []) as List<dynamic>;
    final cleanPitch = rawPitch.map((e) => e.toString().replaceAll('**', '').replaceAll('*', '').trim()).where((s) => s.isNotEmpty).toList();

    final rawRecalled = (json['recalled_memories'] ?? json['recalledMemories'] ?? []) as List<dynamic>;
    final cleanRecalled = rawRecalled
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    return RecommendationResult(
      title: ((json['title'] ?? 'Unknown') as String).replaceAll('**', '').replaceAll('*', '').trim(),
      mediaType: json['media_type'] ?? 'unknown',
      codaBlurb: cleanBlurb,
      pitchParagraphs: cleanPitch,
      posterUrl: rawPoster,
      ostUrl: json['ost_url'] ?? '',
      trailerUrl: json['trailer_url'] ?? '',
      description: ((json['description'] ?? '') as String).replaceAll('**', '').replaceAll('*', '').trim(),
      genres: List<String>.from(json['genres'] ?? []),
      tags: List<String>.from(json['tags'] ?? []),
      releaseYear: json['release_year'] ?? '',
      studio: json['studio'] ?? '',
      recalledMemories: cleanRecalled,
      queryUsed: (json['query_used'] ?? json['queryUsed']) as String?,
      moodAngle: (json['mood_angle'] ?? json['moodAngle']) as String?,
      attributedMemory: (json['attributed_memory'] ?? json['attributedMemory']) as String?,
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
      recalledMemories: recalledMemories,
      queryUsed: queryUsed,
      moodAngle: moodAngle,
      attributedMemory: attributedMemory,
    );
  }
}

final recommendationServiceProvider = Provider<RecommendationService>((ref) {
  final userId = ref.watch(userIdProvider);
  final userToken = ref.watch(userTokenProvider);
  return RecommendationService(userId: userId, userToken: userToken);
});

class RecommendationService {
  final String userId;
  final String userToken;

  RecommendationService({required this.userId, this.userToken = ''});

  Map<String, String> get authHeaders => {
        'Content-Type': 'application/json',
        if (userToken.isNotEmpty) 'X-Coda-Token': userToken,
      };

  static String get _baseUrl => '${getApiBaseUrl()}/api/recommend';

  /// Fetches recommendations using the user's Living Memory and current environmental context
  Future<List<RecommendationResult>> fetchRecommendations(
    LivingMemory memory, 
    coda_domain.MediaType selectedMediaType, {
    List<String> additionalExclusions = const [],
    int limit = 1,
    bool watchlistOnly = false,
    bool memoriesEnabled = true,
    String? ambientContext,
  }) async {
    // Build seen list including exclusions only when memories are enabled
    Map<String, dynamic> fallbackMemory;
    if (memoriesEnabled) {
      final finalSeen = List<String>.from(memory.seen);
      for (final title in additionalExclusions) {
        if (!finalSeen.contains(title)) finalSeen.add(title);
      }
      fallbackMemory = memory.toJson();
      fallbackMemory['seen'] = finalSeen;
    } else {
      // Amnesia mode: zero user memory, zero seen exclusions (only watchlist if watchlist mode is explicitly on)
      fallbackMemory = watchlistOnly
          ? {'watchlist': memory.toJson()['watchlist'] ?? {}}
          : <String, dynamic>{};
    }

    final payload = {
      'userId': memoriesEnabled ? userId : null,
      'requested_media_type': selectedMediaType.name, // The user explicitly tapped this tab
      'current_memory': fallbackMemory,
      if (ambientContext != null && memoriesEnabled) 'contextualState': ambientContext,
      'limit': limit,
      'watchlist_only': watchlistOnly,
      'memories_enabled': memoriesEnabled,
    };


    final targetUrl = _baseUrl;

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: authHeaders,
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
        headers: authHeaders,
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
    bool memoriesEnabled = true,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('${getApiBaseUrl()}/api/recommend/pitch'),
        headers: authHeaders,
        body: jsonEncode({
          'title': title,
          'requested_media_type': mediaType,
          'userId': memoriesEnabled ? userId : null,
          'memories_enabled': memoriesEnabled,
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
    bool memoriesEnabled = true,
  }) async {
    final payload = {
      'userId': memoriesEnabled ? userId : null,
      'current_memory': memoriesEnabled
          ? memory.toJson()
          : (watchlistOnly
              ? {'watchlist': memory.toJson()['watchlist'] ?? []}
              : <String, dynamic>{}),
      'chat_history': chatHistory,
      'user_message': userMessage,
      'watchlist_only': watchlistOnly,
      'memories_enabled': memoriesEnabled,
    };

    final targetUrl = '${getApiBaseUrl()}/api/recommend/ask';

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: authHeaders,
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      } else {
        throw Exception('Ask Coda HTTP ${response.statusCode}: ${response.body}');
      }
    } catch (e) {
      print("Ask Coda network error: $e");
      return {
        'status': 'chatting',
        'message': "[Debug Error (Ask Coda)]: $e",
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
    bool memoriesEnabled = true,
  }) async {
    final payload = {
      'userId': memoriesEnabled ? userId : null,
      'current_memory': memoriesEnabled ? memory.toJson() : <String, dynamic>{},
      'title': title,
      'media_type': mediaType,
      'coda_blurb': codaBlurb,
      'pitch_paragraphs': pitchParagraphs,
      'chat_history': chatHistory,
      'user_message': userMessage,
      'memories_enabled': memoriesEnabled,
    };

    final targetUrl = '${getApiBaseUrl()}/api/recommend/chat';

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: authHeaders,
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['message'] ?? "I'm not sure how to respond to that.";
      } else {
        throw Exception('Discuss HTTP ${response.statusCode}: ${response.body}');
      }
    } catch (e) {
      print("Chat network error: $e");
      return "[Debug Error (Discuss)]: $e";
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
    bool memoriesEnabled = true,
  }) async {
    final payload = {
      'userId': memoriesEnabled ? userId : null,
      'current_memory': memoriesEnabled ? memory.toJson() : <String, dynamic>{},
      'title': title,
      'media_type': mediaType,
      'coda_blurb': codaBlurb,
      'pitch_paragraphs': pitchParagraphs,
      'chat_history': chatHistory,
      'user_message': userMessage,
      'memories_enabled': memoriesEnabled,
    };

    final targetUrl = '${getApiBaseUrl()}/api/recommend/chat';

    try {
      final response = await http.post(
        Uri.parse(targetUrl),
        headers: authHeaders,
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final message = data['message'] ?? "I'm not sure how to respond to that.";
        final oneLineSummary = data['one_line_summary'] as String?;
        final updatesJson = data['memory_updates'];
        final memoryUpdates = updatesJson != null ? MemoryUpdates.fromJson(updatesJson) : null;
        final savedMemory = data['saved_memory'] as String?;
        final recalledMemory = data['recalled_memory'] as String?;
        final rawRecalled = (data['recalled_memories'] as List?)
                ?.whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList() ??
            const [];
        final rawWrites = (data['walrus_writes'] as List?)
                ?.whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList() ??
            const [];
        final queryUsed = data['query_used'] as String?;

        return DiscussResult(
          message: message,
          oneLineSummary: oneLineSummary,
          memoryUpdates: memoryUpdates,
          savedMemory: savedMemory,
          recalledMemory: recalledMemory,
          recalledMemories: rawRecalled,
          walrusWrites: rawWrites,
          queryUsed: queryUsed,
        );
      } else {
        throw Exception('Discuss HTTP ${response.statusCode}: ${response.body}');
      }
    } catch (e) {
      print("Chat network error: $e");
      return DiscussResult(
        message: "[Debug Error (Discuss Refinements)]: $e",
      );
    }
  }

  /// Fetches live Walrus Protocol state (account object ID, namespaces, pending write job resolutions, and live recalled/recorded blobs)
  Future<Map<String, dynamic>> fetchWalrusLive({
    List<String> jobIds = const [],
    String? query,
    String? category,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('${getApiBaseUrl()}/api/recommend/walrus-live'),
        headers: authHeaders,
        body: jsonEncode({
          'userId': userId,
          'job_ids': jobIds,
          if (query != null && query.isNotEmpty) 'query': query,
          if (category != null && category.isNotEmpty) 'category': category,
        }),
      );
      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      }
    } catch (e) {
      print("Walrus live fetch error: $e");
    }
    return <String, dynamic>{};
  }
}

class DiscussResult {
  final String message;
  final String? oneLineSummary;
  final MemoryUpdates? memoryUpdates;
  final String? savedMemory;
  final String? recalledMemory;
  final List<Map<String, dynamic>> recalledMemories;
  final List<Map<String, dynamic>> walrusWrites;
  final String? queryUsed;

  DiscussResult({
    required this.message,
    this.oneLineSummary,
    this.memoryUpdates,
    this.savedMemory,
    this.recalledMemory,
    this.recalledMemories = const [],
    this.walrusWrites = const [],
    this.queryUsed,
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
        headers: authHeaders,
        body: jsonEncode(payload),
      );

      if (response.statusCode == 200) {
        return VibeCheckResult.fromJson(jsonDecode(response.body));
      } else {
        throw Exception('Vibe check HTTP ${response.statusCode}: ${response.body}');
      }
    } catch (e) {
      print("Vibe check error: $e");
      return VibeCheckResult(
        isMatch: null,
        convictionStatement: "[Debug Error (Vibe Check)]: $e",
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
        headers: authHeaders,
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

  Future<String?> submitSwipe({
    required String title,
    required String action, // 'loved', 'not_for_me', 'seen'
    String? mediaType,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('${getApiBaseUrl()}/api/recommend/swipe'),
        headers: authHeaders,
        body: jsonEncode({
          'userId': userId,
          'title': title,
          'action': action,
          if (mediaType != null && mediaType.isNotEmpty) 'media_type': mediaType,
        }),
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['saved_memory'] as String?;
      }
    } catch (e) {
      print("Submit swipe error: $e");
    }
    return null;
  }
}
