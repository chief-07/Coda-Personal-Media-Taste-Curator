class MediaType {
  final String name;
  final String label;
  final bool isCustom;

  const MediaType({
    required this.name,
    required this.label,
    this.isCustom = false,
  });

  static const anime = MediaType(name: 'anime', label: 'Anime');
  static const movie = MediaType(name: 'movie', label: 'Movies');
  static const tv = MediaType(name: 'tv', label: 'TV Shows');
  static const visualNovel = MediaType(name: 'visualNovel', label: 'Visual Novels');
  static const manga = MediaType(name: 'manga', label: 'Manga');
  static const game = MediaType(name: 'game', label: 'Games');
  static const youtube = MediaType(name: 'youtube', label: 'YouTube');
  static const book = MediaType(name: 'book', label: 'Books');
  static const music = MediaType(name: 'music', label: 'Music');

  static const List<MediaType> values = [
    anime,
    movie,
    tv,
    visualNovel,
    manga,
    game,
    youtube,
    book,
    music,
  ];

  factory MediaType.custom(String label) {
    final cleanLabel = label.trim();
    if (cleanLabel.isEmpty) {
      return const MediaType(name: 'unknown', label: 'Unknown', isCustom: true);
    }
    final words = cleanLabel.split(RegExp(r'[\s_\-]'));
    final name = words.first.toLowerCase() +
        words.skip(1).map((w) {
          if (w.isEmpty) return '';
          return w[0].toUpperCase() + w.substring(1).toLowerCase();
        }).join('');
    return MediaType(
      name: name,
      label: cleanLabel,
      isCustom: true,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MediaType && runtimeType == other.runtimeType && name == other.name;

  @override
  int get hashCode => name.hashCode;
}
