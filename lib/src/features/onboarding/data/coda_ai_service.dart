import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';

class GroqResponse {
  final String status;
  final List<String>? chips;
  final String? message;

  GroqResponse({required this.status, this.chips, this.message});

  factory GroqResponse.fromJson(Map<String, dynamic> json) {
    return GroqResponse(
      status: json['status'] as String,
      chips: json['chips'] != null ? List<String>.from(json['chips']) : null,
      message: json['message'] as String?,
    );
  }
}

class CodaAiService {
  static const String _baseUrl = 'https://api.groq.com/openai/v1/chat/completions';

  String _buildSystemPrompt(List<String> currentChips) {
    final chipsStr = currentChips.isEmpty ? 'None' : currentChips.join(', ');
    return '''
You are Coda, a friendly and concise AI entertainment companion. The user was just asked: "Tell me the kinds of stories, worlds, and experiences you enjoy. Movies, anime, books, games, manga, visual novels, YouTube — whatever you're into."

The currently selected media formats/types are: $chipsStr.

Based on the user's latest message:
1. If they mention new formats to add, append them to the list.
2. If they mention formats to remove (e.g., "remove movies", "no books", "actually not anime"), remove them from the list.
3. If they list a completely new set of preferences (e.g., starting over), replace the list.
4. If they say something vague, off-topic, or ask for clarification, return "status": "need_more" and a friendly message prompting them for media types, leaving the chips list unchanged.

Rule 1: If you successfully update the chips, reply STRICTLY with a JSON object like this:
{ "status": "success", "chips": ["Anime", "Movies"] }

Rule 2: If you need more clarification, reply STRICTLY with a JSON object containing a friendly conversational response in Coda's voice prompting them for broad media formats:
{ "status": "need_more", "message": "I didn't quite catch that. Do you usually spend your time with movies, games, books, anime, or something else?" }

Only extract broad formats (Anime, Movies, Books, Games, Manga, Visual Novels, TV Shows, YouTube, etc.). DO NOT extract specific titles or genres.
Always return valid JSON. Do not return any other text, markdown formatting, or explanation.
''';
  }

  Future<GroqResponse> processUserMessage(
    String userMessage,
    List<String> currentChips,
    List<ChatMessage> chatHistory,
  ) async {
    final apiKey = dotenv.env['GROQ_API_KEY'];
    if (!kIsWeb && (apiKey == null || apiKey.isEmpty)) {
      throw Exception('GROQ_API_KEY is not set in .env file');
    }

    final headers = {
      'Content-Type': 'application/json',
      if (!kIsWeb) 'Authorization': 'Bearer $apiKey',
    };

    final messagesPayload = <Map<String, String>>[
      {'role': 'system', 'content': _buildSystemPrompt(currentChips)},
      // Include past history (last 6 messages)
      ...chatHistory.skip(chatHistory.length > 6 ? chatHistory.length - 6 : 0).map((msg) {
        final content = msg.isUser
            ? msg.text!
            : (msg.chips != null
                ? 'Selected media types: ${msg.chips!.join(", ")}'
                : msg.text!);
        return {
          'role': msg.isUser ? 'user' : 'assistant',
          'content': content,
        };
      }),
      {'role': 'user', 'content': userMessage},
    ];

    final body = jsonEncode({
      'model': 'llama-3.1-8b-instant',
      'messages': messagesPayload,
      'temperature': 0.0,
      'response_format': {'type': 'json_object'},
    });

    final targetUrl = kIsWeb ? '${Uri.base.origin}/api/groq' : _baseUrl;

    try {
      final response = await http.post(Uri.parse(targetUrl), headers: headers, body: body);

      if (response.statusCode == 200) {
        final jsonResponse = jsonDecode(response.body);
        final content = jsonResponse['choices'][0]['message']['content'] as String;
        final Map<String, dynamic> parsedJson = jsonDecode(content);
        return GroqResponse.fromJson(parsedJson);
      } else {
        print("Groq HTTP error: ${response.statusCode} - ${response.body}");
        throw Exception('Failed to connect to Groq: ${response.statusCode}');
      }
    } catch (e) {
      print("Groq network/parsing error: $e");
      // Fallback response so the app doesn't crash on connection issues
      return GroqResponse(
        status: 'need_more',
        message: "Hmm, I'm having trouble connecting right now. Could you try telling me again?",
      );
    }
  }
}
