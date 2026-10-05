import 'package:coda/src/core/memory/living_memory.dart';
import 'package:coda/src/features/onboarding/application/onboarding_controller.dart';

class ArchivedSession {
  final String id;
  final String title;
  final String mediaType;
  final String posterUrl;
  final String oneLineSummary;
  final List<ChatMessage> chatHistory;
  final DateTime archivedAt;

  ArchivedSession({
    required this.id,
    required this.title,
    required this.mediaType,
    required this.posterUrl,
    required this.oneLineSummary,
    required this.chatHistory,
    required this.archivedAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'mediaType': mediaType,
        'posterUrl': posterUrl,
        'oneLineSummary': oneLineSummary,
        'chatHistory': chatHistory
            .map((m) => {
                  'text': m.text,
                  'chips': m.chips,
                  'isUser': m.isUser,
                  'savedMemory': m.memoryUpdates?.savedMemory,
                  'recalledMemory': m.recalledMemory,
                })
            .toList(),
        'archivedAt': archivedAt.toIso8601String(),
      };

  factory ArchivedSession.fromJson(Map<String, dynamic> json) {
    return ArchivedSession(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      mediaType: json['mediaType'] as String? ?? json['media_type'] as String? ?? '',
      posterUrl: json['posterUrl'] as String? ?? json['poster_url'] as String? ?? '',
      oneLineSummary: json['oneLineSummary'] as String? ?? json['one_line_summary'] as String? ?? '',
      chatHistory: (json['chatHistory'] as List<dynamic>?)
              ?.map((e) {
                final map = e as Map<String, dynamic>;
                final savedMem = map['savedMemory'] as String?;
                final recalledMem = map['recalledMemory'] as String?;
                return ChatMessage(
                  text: map['text'] as String?,
                  chips: map['chips'] != null ? List<String>.from(map['chips']) : null,
                  isUser: map['isUser'] as bool? ?? map['is_user'] as bool? ?? false,
                  memoryUpdates: savedMem != null && savedMem.isNotEmpty
                      ? MemoryUpdates(savedMemory: savedMem)
                      : null,
                  recalledMemory: recalledMem,
                );
              })
              .toList() ??
          [],
      archivedAt: json['archivedAt'] != null
          ? DateTime.parse(json['archivedAt'] as String)
          : json['archived_at'] != null
              ? DateTime.parse(json['archived_at'] as String)
              : DateTime.now(),
    );
  }
}
