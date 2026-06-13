import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:coda/src/features/home/domain/recommendation.dart';
import 'package:flutter/material.dart';

const mockRecommendations = [
  Recommendation(
    id: 'anime-1',
    title: 'Serial Experiments Lain',
    mediaType: MediaType.anime,
    codaBlurb: 'Psychological trauma dressed as a teddy bear',
    codaNote:
        'This is one of those shows that rewires how you think about identity and connection. It is slow, unsettling, and quietly devastating. If you are in the mood to feel something that lingers for weeks, this is it.',
    description:
        'A 13-episode anime about a withdrawn girl who discovers the Wired - a vast communication network - and slowly loses the boundary between herself and the digital world.',
    genres: ['Sci-fi', 'Psychological'],
    tags: ['13 eps'],
    fitSignals: [
      'identity dissolution',
      'slow-burn unease',
      'atmosphere over plot',
      'loneliness as a theme',
    ],
    posterGradient: [Color(0xFF1A1228), Color(0xFF3D2B5A), Color(0xFF6B5B7B)],
    releaseYear: '1998',
    studio: 'Triangle Staff',
    posterUrl: 'assets/lain.jpg',
  ),
  Recommendation(
    id: 'movie-1',
    title: 'Interstellar',
    mediaType: MediaType.movie,
    codaBlurb: 'The definitive 21st century Space Odyssey',
    codaNote:
        'This is Nolan at his most emotionally ambitious. The science is real enough to feel grounded, but the heart of it is a father trying to get back to his daughter. The docking scene alone is worth the entire runtime.',
    description:
        'A team of explorers travel through a wormhole near Saturn in search of a new home for humanity, as Earth becomes uninhabitable.',
    genres: ['Sci-fi', 'Drama'],
    tags: ['2h 49m'],
    fitSignals: [
      'emotional spectacle',
      'father-daughter bond',
      'time as a weapon',
      'Hans Zimmer at peak power',
    ],
    posterGradient: [Color(0xFF0D1B2A), Color(0xFF1B3A4B), Color(0xFFC8956C)],
    posterUrl: 'assets/interstellar.jpg',
    releaseYear: '2014',
    studio: 'Syncopy',
    pitch: [
      'Trust me, this one is very you.',
      'It has the huge sci-fi ideas, the impossible stakes, the beautiful score, all of that. But the reason I think you will really get it is because underneath the space stuff, it is made for people who feel things deeply.',
      'It is not just "cool astronauts and black holes." It is about love, time, regret, family, and trying to hold onto someone even when the universe keeps pulling everything apart.',
      'Some people watch it and only see the spectacle. I think you will actually get the ache inside it.',
      'You will probably cry. Not because it is trying too hard to make you cry but because it earns every single moment. The kind of movie that sits with you for days afterward.',
    ],
  ),
  Recommendation(
    id: 'vn-1',
    title: 'The House in Fata Morgana',
    mediaType: MediaType.visualNovel,
    codaBlurb: 'Grief wearing a gothic dress for four centuries',
    codaNote:
        'This is a little heavier than a casual pick, but it has the kind of emotional aftertaste Coda should care about. Every chapter recontextualises the last.',
    description:
        'A gothic visual novel built around memory, grief, identity, and stories that keep changing shape as you understand who was hurt.',
    genres: ['Gothic', 'Drama'],
    tags: ['30+ hrs'],
    fitSignals: [
      'character pain that is earned',
      'slow reveals',
      'romance tangled with damage',
      'strong emotional aftermath',
    ],
    posterGradient: [Color(0xFF27212D), Color(0xFF6F3B44), Color(0xFFD0A95F)],
    releaseYear: '2012',
    studio: 'Novectacle',
  ),
  Recommendation(
    id: 'manga-1',
    title: 'Goodnight Punpun',
    mediaType: MediaType.manga,
    codaBlurb: 'A coming-of-age story that forgot to be gentle',
    codaNote:
        'Punpun looks like a children doodle but reads like a panic attack. Inio Asano drew something that makes you feel like you are watching someone fall apart in slow motion. It is uncomfortable and unforgettable.',
    description:
        'A manga following Punpun Onodera from childhood to adulthood, depicting his increasingly dark spiral through depression, love, and self-destruction.',
    genres: ['Psychological', 'Drama'],
    tags: ['147 ch'],
    fitSignals: [
      'unreliable self-perception',
      'crushing realism',
      'art that shifts with mood',
      'no easy comfort',
    ],
    posterGradient: [Color(0xFF1C1C1C), Color(0xFF3A3A3A), Color(0xFF8C7B6B)],
    releaseYear: '2007',
    studio: 'Shogakukan',
  ),
  Recommendation(
    id: 'game-1',
    title: 'Outer Wilds',
    mediaType: MediaType.game,
    codaBlurb: 'Curiosity as the only game mechanic that matters',
    codaNote:
        'No quest markers, no upgrades, no combat. Just a solar system that is ending in 22 minutes and the overwhelming need to understand why. This is the purest exploration game ever made.',
    description:
        'A space exploration game set in a handcrafted solar system trapped in a time loop. Every secret is discovered through observation and curiosity alone.',
    genres: ['Exploration', 'Mystery'],
    tags: ['15-20 hrs'],
    fitSignals: [
      'genuine wonder',
      'player-driven discovery',
      'time loop done right',
      'existential but warm',
    ],
    posterGradient: [Color(0xFF0B1628), Color(0xFF1B4332), Color(0xFFE8A849)],
    releaseYear: '2019',
    studio: 'Mobius Digital',
  ),
  Recommendation(
    id: 'music-1',
    title: 'Vespertine',
    mediaType: MediaType.music,
    codaBlurb: 'Intimacy recorded at the cellular level',
    codaNote:
        'Bjork made an album that sounds like being inside someone chest. Microbeats, music boxes, a choir - it is winter and warmth and vulnerability condensed into 55 minutes.',
    description:
        'Bjork fourth studio album - a work of glacial electronica, choral arrangements, and radical intimacy.',
    genres: ['Electronic', 'Art Pop'],
    tags: ['55 min'],
    fitSignals: [
      'texture over melody',
      'emotional precision',
      'winter atmosphere',
      'deeply personal',
    ],
    posterGradient: [Color(0xFF1A1A2E), Color(0xFF4A3F6B), Color(0xFFD4C5F9)],
    releaseYear: '2001',
    studio: 'One Little Independent',
  ),
];

List<MediaType> get mediaTypesWithRecommendations {
  final seen = <MediaType>{};
  return [
    for (final recommendation in mockRecommendations)
      if (seen.add(recommendation.mediaType)) recommendation.mediaType,
  ];
}

Recommendation? recommendationForType(MediaType type) {
  try {
    return mockRecommendations.firstWhere((r) => r.mediaType == type);
  } catch (_) {
    return null;
  }
}

Recommendation? recommendationById(String id) {
  try {
    return mockRecommendations.firstWhere((r) => r.id == id);
  } catch (_) {
    return null;
  }
}
