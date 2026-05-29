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
    this.posterUrl,
    this.pitch = const [],
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

  /// Release year to show beside the title.
  final String releaseYear;

  /// Conversational pitch paragraphs shown on the pitch screen.
  final List<String> pitch;
}
