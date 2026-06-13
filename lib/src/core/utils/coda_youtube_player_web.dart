import 'dart:html' as html;
import 'dart:ui_web' as ui_web;
import 'package:flutter/material.dart';

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
  State<CodaYoutubePlayer> createState() => _CodaYoutubePlayerWebState();
}

class _CodaYoutubePlayerWebState extends State<CodaYoutubePlayer> {
  late final String _viewId;

  @override
  void initState() {
    super.initState();
    // Generate a unique view ID for this specific video player instance
    _viewId = 'youtube-player-${widget.videoId}-${DateTime.now().microsecondsSinceEpoch}';
    
    // Register the custom IFrame factory for the generated ID
    ui_web.platformViewRegistry.registerViewFactory(_viewId, (int viewId) {
      final autoplayParam = widget.autoPlay ? '1' : '0';
      final muteParam = widget.mute ? '1' : '0';
      final controlsParam = widget.showControls ? '1' : '0';
      final loopParam = widget.loop ? '1' : '0';
      final playlistParam = widget.loop ? '&playlist=${widget.videoId}' : '';

      final iframe = html.IFrameElement()
        ..src = 'https://www.youtube.com/embed/${widget.videoId}?autoplay=$autoplayParam&mute=$muteParam&controls=$controlsParam&rel=0&loop=$loopParam$playlistParam&playsinline=1&modestbranding=1&iv_load_policy=3&fs=0&disablekb=1'
        ..style.border = 'none'
        ..style.width = '100%'
        ..style.height = '100%'
        ..allow = 'autoplay; encrypted-media';

      iframe.onLoad.listen((_) {
        widget.onReady?.call();
      });

      return iframe;
    });
  }

  @override
  Widget build(BuildContext context) {
    return HtmlElementView(viewType: _viewId);
  }
}
