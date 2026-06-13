import 'package:flutter/material.dart';

class CodaYoutubePlayer extends StatelessWidget {
  const CodaYoutubePlayer({
    required this.videoId,
    this.autoPlay = true,
    this.showControls = true,
    this.mute = false,
    this.loop = false,
    this.onReady,
    super.key,
  });

  final String videoId;
  final bool autoPlay;
  final bool showControls;
  final bool mute;
  final bool loop;
  final VoidCallback? onReady;

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}
