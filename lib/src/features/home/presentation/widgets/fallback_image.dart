import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:coda/src/core/providers/api_config.dart';

class FallbackImage extends StatefulWidget {
  final String? url;
  final BoxFit fit;
  final Widget? errorWidget;
  final double? width;
  final double? height;

  const FallbackImage({
    required this.url,
    required this.fit,
    this.errorWidget,
    this.width,
    this.height,
    super.key,
  });

  @override
  State<FallbackImage> createState() => _FallbackImageState();
}

class _FallbackImageState extends State<FallbackImage> {
  bool _useFallback = false;
  bool _failed = false;

  @override
  void didUpdateWidget(FallbackImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _useFallback = false;
      _failed = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final defaultError = widget.errorWidget ?? Container(color: const Color(0xFF16181C));

    if (widget.url == null || widget.url!.isEmpty) {
      return defaultError;
    }

    if (_failed) {
      return defaultError;
    }

    String currentUrl = widget.url!;
    
    // Resolve relative proxy paths first
    if (currentUrl.startsWith('/')) {
      currentUrl = '${getApiBaseUrl()}$currentUrl';
    } else if (kIsWeb && currentUrl.startsWith('http') && !currentUrl.contains('/api/recommend/proxy-image')) {
      // Force all direct external HTTP images through backend proxy on Web to prevent WebGL canvas tainting & blank white crash
      currentUrl = '${getApiBaseUrl()}/api/recommend/proxy-image?url=${Uri.encodeComponent(currentUrl)}';
    }

    // On native platforms only, we can safely attempt raw unproxied fallback if the proxy fails
    if (!kIsWeb && _useFallback) {
      final fullUrl = widget.url!.startsWith('/')
          ? '${getApiBaseUrl()}${widget.url!}'
          : widget.url!;
      if (fullUrl.contains('/api/recommend/proxy-image?url=')) {
        try {
          final uri = Uri.parse(fullUrl);
          final original = uri.queryParameters['url'];
          if (original != null && original.isNotEmpty) {
            currentUrl = original;
          }
        } catch (_) {}
      }
    }

    return Image(
      image: currentUrl.startsWith('assets/')
          ? AssetImage(currentUrl) as ImageProvider
          : NetworkImage(currentUrl),
      fit: widget.fit,
      width: widget.width,
      height: widget.height,
      errorBuilder: (context, error, stackTrace) {
        if (!kIsWeb && !_useFallback && widget.url!.contains('/api/recommend/proxy-image?url=')) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              setState(() {
                _useFallback = true;
              });
            }
          });
        } else {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              setState(() {
                _failed = true;
              });
            }
          });
        }
        return defaultError;
      },
    );
  }
}
