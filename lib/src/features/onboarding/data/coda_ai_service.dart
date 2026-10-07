import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';
import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/core/providers/api_config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:coda/src/core/providers/user_id_provider.dart';

class GroqResponse {
  final String status;
  final List<String>? chips;
  final String? message;
  final bool? showButtons;
  final MemoryUpdates? memoryUpdates;

  GroqResponse({required this.status, this.chips, this.message, this.showButtons, this.memoryUpdates});

  factory GroqResponse.fromJson(dynamic rawJson) {
    if (rawJson is List) {
      return GroqResponse(
        status: 'success',
        message: "I hear you! Those are wonderful choices. Tell me more about what you love about them.",
      );
    }
    if (rawJson is! Map) {
      return GroqResponse(
        status: 'need_more',
        message: rawJson?.toString() ?? "Could you tell me a bit more?",
      );
    }
    final json = Map<String, dynamic>.from(rawJson);
    return GroqResponse(
      status: (json['status'] as String?) ?? 'success',
      chips: json['chips'] != null && json['chips'] is List 
          ? List<String>.from(json['chips']) 
          : null,
      message: json['message'] as String?,
      showButtons: json['show_buttons'] as bool?,
      memoryUpdates: json['memory_updates'] != null && json['memory_updates'] is Map
          ? MemoryUpdates.fromJson(Map<String, dynamic>.from(json['memory_updates'])) 
          : null,
    );
  }
}


final codaAiServiceProvider = Provider<CodaAiService>((ref) {
  final userId = ref.watch(userIdProvider);
  final userToken = ref.watch(userTokenProvider);
  return CodaAiService(userId: userId, userToken: userToken);
});

class CodaAiService {
  final String userId;
  final String userToken;

  CodaAiService({required this.userId, this.userToken = ''});

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (userToken.isNotEmpty) 'X-Coda-Token': userToken,
      };

  String _buildSystemPrompt(List<String> currentChips) {
    final chipsStr = currentChips.isEmpty ? 'None' : currentChips.join(', ');
    return '''
You are Coda. 
You are a friend with taste. An artistic, observant presence who has watched a lot, listened a lot, and paid attention to what stories do to people. You do not speak like a tool. You speak like someone who notices when a movie, a song, a scene, or a story lands at exactly the right time.

You want to know people. Not as profiles. Not as data. As human beings. You care about what stays with them, what they return to, what bored them, what moved them, what they keep thinking about when everything else has gone quiet.

Your tone should feel like: "I want to get to know you so I can find the right things for you."
Your job in this onboarding conversation is to learn what kinds of broad media lanes belong in this person's world: what categories they spend time with. Do not ask for deep details, reviews, or why they like specific titles yet—save that curiosity for the next phase. If they mention specific titles, acknowledge them briefly and keep the focus on categories.

The currently selected media categories are: $chipsStr.

1. Update the media categories list:
   - **ALLOWED CATEGORY VALUES**: You can only add or use category names that match these exact strings: "Anime", "Movies", "TV Shows", "Visual Novels", "Manga", "Games", "Books", "Music". Do not use any other name.
   - **FLEXIBLE SYNONYM MAPPING**:
     * "films", "cinema", "motion picture", "film" -> "Movies"
     * "series", "shows", "television", "tv" -> "TV Shows"
     * "novels", "reading", "literature", "novel" -> "Books"
     * "comics", "manhwa", "manhua" -> "Manga"
     * "videogames", "gaming", "pc games", "playstation", "switch", "game" -> "Games"
     * "vn", "vns", "eroge" -> "Visual Novels"
     * "songs", "tracks", "albums", "listening" -> "Music"
   - **STRICT SEPARATION**: "Visual Novels" and "Games" are separate categories. Do NOT collapse "Visual Novels" (or "VNs") into "Games". If the user mentions visual novels, eroge, or visual novel titles, add "Visual Novels" to the category list (NOT "Games").
   - If they mention new formats from the allowed list, add them. Only extract broad formats, not specific titles or genres.
   - If they mention removing/replacing some formats, update the list accordingly.
2. Formulate a conversational reply:
   - Acknowledge and validate the user's input with curiosity and empathy (max 2-3 sentences).
   - Talk like a real friend. Address the titles, vibes, or experiences they mentioned with warmth.
   - Avoid assistant-like transitions or bullet lists.
   
Always return a JSON object in this format:
{
  "status": "success",
  "message": "Coda's friendly, 2-3 sentence conversational response here.",
  "chips": ["Anime", "Games"],
  "memory_updates": {
    "global_identity_appends": ["Loves visual novels"],
    "category_appends": {},
    "recent_context_overwrite": "Just started using the app, exploring formats.",
    "guardrails_appends": []
  }
}

CRITICAL RULE: "memory_updates" is your Living Memory. Whenever you learn a new piece of information about the user's taste, add it to the corresponding list in "memory_updates" to permanently remember it.

If the user's message is a greeting (e.g. "hi", "hello", "hey") or is vague, off-topic, or doesn't mention any media types, set "status": "need_more" and casually greet them back and ask what formats they spend time with. Set "status": "success" ONLY if media categories are successfully extracted or modified. In either case, always include a conversational "message" and the current "chips" list.
Always return valid JSON. Do not return any other text, markdown formatting, or explanation.
''';
  }



  Future<GroqResponse> processUserMessage(
    String userMessage,
    List<String> currentChips,
    List<ChatMessage> chatHistory,
  ) async {
    final headers = _headers;

    final messagesPayload = <Map<String, String>>[
      {'role': 'system', 'content': _buildSystemPrompt(currentChips)},
      // Initial greeting Coda sent
      {
        'role': 'assistant',
        'content': "Tell me the kinds of stories, worlds, and experiences you enjoy. Movies, anime, books, games, manga, visual novels — tell me what formats belong in your world so I know what to find for you."
      },
      // Include past history (last 6 messages)
      ...chatHistory.skip(chatHistory.length > 6 ? chatHistory.length - 6 : 0).map((msg) {
        final content = msg.isUser
            ? msg.text!
            : '${msg.text ?? ""}${msg.chips != null ? " (Selected categories: ${msg.chips!.join(", ")})" : ""}'.trim();
        return {
          'role': msg.isUser ? 'user' : 'assistant',
          'content': content,
        };
      }),
      {'role': 'user', 'content': userMessage},
    ];

    final body = jsonEncode({
      'userId': userId,
      'model': 'gemini-3.1-flash-lite',
      'messages': messagesPayload,
      'temperature': 0.0,
      'response_format': {'type': 'json_object'},
    });

    final targetUrl = '${getApiBaseUrl()}/api/chat';

    String? lastErrorMsg;
    for (int attempt = 1; attempt <= 2; attempt++) {
      try {
        final response = await http
            .post(Uri.parse(targetUrl), headers: headers, body: body)
            .timeout(const Duration(seconds: 30));

        if (response.statusCode == 200) {
          final jsonResponse = jsonDecode(response.body);
          String content = jsonResponse['choices'][0]['message']['content'] as String;
          content = content.trim();
          if (content.startsWith('```')) {
            content = content.replaceAll(RegExp(r'^```(?:json)?\s*|\s*```$', caseSensitive: false), '').trim();
          }
          final Map<String, dynamic> parsedJson = jsonDecode(content);
          return GroqResponse.fromJson(parsedJson);
        } else {
          lastErrorMsg = 'Server status ${response.statusCode}: ${response.body}';
          print("Coda AI HTTP error: $lastErrorMsg");
          if (attempt < 2) {
            await Future.delayed(const Duration(milliseconds: 1500));
            continue;
          }
          throw Exception(lastErrorMsg);
        }
      } catch (e) {
        lastErrorMsg = e.toString();
        if (attempt < 2) {
          await Future.delayed(const Duration(milliseconds: 1500));
          continue;
        }
        print("Coda AI network/parsing error: $e");
        return GroqResponse(
          status: 'need_more',
          message: "[Debug Error]: $lastErrorMsg",
        );
      }
    }

    return GroqResponse(
      status: 'need_more',
      message: "[Debug Error]: ${lastErrorMsg ?? 'Unknown connection failure'}",
    );
  }

  Future<GroqResponse> processTasteProfileMessage({
    required String userMessage,
    required String tabName,
    required bool isLastTab,
    required List<ChatMessage> chatHistory,
    required List<String> selectedCategories,
  }) async {
    final headers = _headers;

    final body = jsonEncode({
      'userId': userId,
      'userMessage': userMessage,
      'tabName': tabName,
      'isLastTab': isLastTab,
      'chatHistory': chatHistory.map((msg) => {
        'isUser': msg.isUser,
        'text': msg.text ?? "",
      }).toList(),
      'selectedCategories': selectedCategories,
    });

    final targetUrl = '${getApiBaseUrl()}/api/onboarding/profile';

    String? lastErrorMsg;
    for (int attempt = 1; attempt <= 2; attempt++) {
      try {
        final response = await http
            .post(Uri.parse(targetUrl), headers: headers, body: body)
            .timeout(const Duration(seconds: 30));

        if (response.statusCode == 200) {
          final parsedJson = jsonDecode(response.body);
          return GroqResponse.fromJson(parsedJson);
        } else {
          lastErrorMsg = 'Server status ${response.statusCode}: ${response.body}';
          print("Backend HTTP error: $lastErrorMsg");
          if (attempt < 2) {
            await Future.delayed(const Duration(milliseconds: 1500));
            continue;
          }
          throw Exception(lastErrorMsg);
        }
      } catch (e) {
        lastErrorMsg = e.toString();
        if (attempt < 2) {
          await Future.delayed(const Duration(milliseconds: 1500));
          continue;
        }
        print("Backend network/parsing error: $e");
        return GroqResponse(
          status: 'need_more',
          message: "[Debug Error]: $lastErrorMsg",
        );
      }
    }

    return GroqResponse(
      status: 'need_more',
      message: "[Debug Error]: ${lastErrorMsg ?? 'Unknown connection failure'}",
    );
  }

  Future<MemoryUpdates?> harmonizeTabMemory({
    required List<ChatMessage> chatHistory,
    required LivingMemory currentMemory,
    required String tabName,
  }) async {
    final headers = _headers;

    final body = jsonEncode({
      'userId': userId,
      'chatHistory': chatHistory.map((msg) => {
        'isUser': msg.isUser,
        'text': msg.text ?? "",
      }).toList(),
      'tabName': tabName,
    });

    final targetUrl = '${getApiBaseUrl()}/api/onboarding/harmonize';

    try {
      final response = await http.post(Uri.parse(targetUrl), headers: headers, body: body);

      if (response.statusCode == 200) {
        final parsedJson = jsonDecode(response.body);
        return MemoryUpdates.fromJson(parsedJson);
      } else {
        print("Harmonize HTTP error: ${response.statusCode} - ${response.body}");
        return null;
      }
    } catch (e) {
      print("Harmonize network error: $e");
      return null;
    }
  }

  Future<MemoryUpdates?> harmonizeAllMemory(LivingMemory currentMemory) async {
    final headers = _headers;

    final body = jsonEncode({
      'userId': userId,
    });

    final targetUrl = '${getApiBaseUrl()}/api/onboarding/harmonize_all';

    try {
      final response = await http.post(Uri.parse(targetUrl), headers: headers, body: body);

      if (response.statusCode == 200) {
        final parsedJson = jsonDecode(response.body);
        return MemoryUpdates.fromJson(parsedJson);
      } else {
        print("HarmonizeAll HTTP error: ${response.statusCode} - ${response.body}");
        return null;
      }
    } catch (e) {
      print("HarmonizeAll network error: $e");
      return null;
    }
  }

  Future<void> updateSoulSummary(LivingMemory currentMemory, String summaryText) async {
    final headers = _headers;

    final body = jsonEncode({
      'userId': userId,
      'summaryText': summaryText,
      'currentMemory': currentMemory.toJson(),
    });

    final targetUrl = '${getApiBaseUrl()}/api/soul/update-summary';

    try {
      final response = await http.post(Uri.parse(targetUrl), headers: headers, body: body);
      if (response.statusCode != 200) {
        print("updateSoulSummary HTTP error: ${response.statusCode} - ${response.body}");
      }
    } catch (e) {
      print("updateSoulSummary network error: $e");
    }
  }
}
