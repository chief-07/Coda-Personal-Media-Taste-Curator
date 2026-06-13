import 'package:flutter/material.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

class CodaYoutubePlayer extends StatefulWidget {
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
  State<CodaYoutubePlayer> createState() => _CodaYoutubePlayerMobileState();
}

class _CodaYoutubePlayerMobileState extends State<CodaYoutubePlayer> {
  late final YoutubePlayerController _controller;

  @override
  void initState() {
    super.initState();
    _controller = YoutubePlayerController.fromVideoId(
      videoId: widget.videoId,
      autoPlay: widget.autoPlay,
      params: YoutubePlayerParams(
        showControls: widget.showControls,
        mute: widget.mute,
        showFullscreenButton: widget.showControls,
        loop: widget.loop,
      ),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.onReady?.call();
    });
  }

  @override
  void dispose() {
    _controller.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return YoutubePlayer(controller: _controller);
  }
}
