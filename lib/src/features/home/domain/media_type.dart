enum MediaType {
  anime('Anime'),
  movie('Movies'),
  visualNovel('Visual Novels'),
  manga('Manga'),
  game('Games'),
  youtube('YouTube'),
  book('Books'),
  music('Music');

  const MediaType(this.label);

  final String label;
}
