import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:flutter/material.dart';

class Recommendation {
  const Recommendation({
    required this.id,
    required this.title,
    required this.mediaType,
    required this.codaBlurb,
    required this.codaNote,
    required this.description,
    required this.genres,
    required this.tags,
    required this.fitSignals,
    required this.posterGradient,
    required this.releaseYear,
    this.studio = '',
    this.posterUrl,
    this.ostUrl,
    this.trailerUrl,
    this.pitch = const [],
    this.recalledMemories = const [],
    this.queryUsed,
    this.moodAngle,
    this.attributedMemory,
  });

  final String id;
  final String title;
  final MediaType mediaType;

  /// Short, punchy hero blurb displayed on the home card.
  /// e.g. "Psychological trauma dressed as a teddy bear"
  final String codaBlurb;

  /// Longer Coda voice note for the detail/chat view.
  final String codaNote;

  /// Full description for the detail page.
  final String description;

  /// Genre labels shown as pills, e.g. ['Sci-fi', 'Psychological'].
  final List<String> genres;

  /// Metadata tags, e.g. ['13 eps', 'Movie', '2h 49m'].
  final List<String> tags;

  /// Taste-fit signals for the detail page.
  final List<String> fitSignals;

  /// Gradient colours extracted from or inspired by the poster.
  final List<Color> posterGradient;

  /// Optional network URL for the poster image.
  final String? posterUrl;

  /// Optional network URL for the soundtrack audio preview stream.
  final String? ostUrl;

  /// Optional YouTube video ID for the trailer.
  final String? trailerUrl;

  /// Release year to show beside the title.
  final String releaseYear;

  /// Studio, developer, publisher, or creator.
  final String studio;

  /// Conversational pitch paragraphs shown on the pitch screen.
  final List<String> pitch;

  /// Walrus memories that directly synthesized this recommendation.
  final List<Map<String, dynamic>> recalledMemories;

  /// Dynamic scout query dispatched to Walrus Protocol for this recommendation.
  final String? queryUsed;

  /// Curatorial mood angle decided by Coda.
  final String? moodAngle;

  /// Attributed memory anchor that tipped the recommendation.
  final String? attributedMemory;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'mediaType': mediaType.name,
        'codaBlurb': codaBlurb,
        'codaNote': codaNote,
        'description': description,
        'genres': genres,
        'tags': tags,
        'fitSignals': fitSignals,
        'posterGradient': posterGradient.map((c) => c.toARGB32()).toList(),
        'posterUrl': posterUrl,
        'ostUrl': ostUrl,
        'trailerUrl': trailerUrl,
        'releaseYear': releaseYear,
        'studio': studio,
        'pitch': pitch,
        'recalledMemories': recalledMemories,
        'queryUsed': queryUsed,
        'moodAngle': moodAngle,
        'attributedMemory': attributedMemory,
      };

  factory Recommendation.fromJson(Map<String, dynamic> json) {
    final mediaTypeName = json['mediaType'] as String? ?? json['media_type'] as String? ?? 'movie';
    final typeEnum = MediaType.values.firstWhere(
      (e) => e.name == mediaTypeName,
      orElse: () {
        final name = mediaTypeName;
        final label = name.isEmpty
            ? 'Custom'
            : name[0].toUpperCase() + name.substring(1);
        return MediaType(name: name, label: label, isCustom: true);
      },
    );

    final rawBlurb = (json['codaBlurb'] as String? ?? json['coda_blurb'] as String? ?? '');
    final cleanBlurb = rawBlurb.replaceAll('**', '').replaceAll('*', '').trim();

    final rawPitch = (json['pitch'] as List<dynamic>? ?? json['pitch_paragraphs'] as List<dynamic>? ?? []);
    final cleanPitch = rawPitch.map((e) => e.toString().replaceAll('**', '').replaceAll('*', '').trim()).where((s) => s.isNotEmpty).toList();

    final rawRecalled = (json['recalledMemories'] as List<dynamic>? ?? json['recalled_memories'] as List<dynamic>? ?? []);
    final cleanRecalled = rawRecalled
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    return Recommendation(
      id: json['id'] as String? ?? '',
      title: (json['title'] as String? ?? '').replaceAll('**', '').replaceAll('*', '').trim(),
      mediaType: typeEnum,
      codaBlurb: cleanBlurb,
      codaNote: json['codaNote'] as String? ?? '',
      description: (json['description'] as String? ?? '').replaceAll('**', '').replaceAll('*', '').trim(),
      genres: List<String>.from(json['genres'] ?? []),
      tags: List<String>.from(json['tags'] ?? []),
      fitSignals: List<String>.from(json['fitSignals'] ?? []),
      posterGradient: (json['posterGradient'] as List<dynamic>?)
              ?.map((val) => Color(val as int))
              .toList() ??
          const [Color(0xFF2B5876), Color(0xFF4E4376)],
      posterUrl: json['posterUrl'] as String?,
      ostUrl: json['ostUrl'] as String?,
      trailerUrl: json['trailerUrl'] as String? ?? json['trailer_url'] as String?,
      releaseYear: json['releaseYear'] as String? ?? json['release_year'] as String? ?? '',
      studio: json['studio'] as String? ?? '',
      pitch: cleanPitch,
      recalledMemories: cleanRecalled,
      queryUsed: json['queryUsed'] as String? ?? json['query_used'] as String?,
      moodAngle: json['moodAngle'] as String? ?? json['mood_angle'] as String?,
      attributedMemory: json['attributedMemory'] as String? ?? json['attributed_memory'] as String?,
    );
  }
}
