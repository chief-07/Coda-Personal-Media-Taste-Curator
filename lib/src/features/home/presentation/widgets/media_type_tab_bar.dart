import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class MediaTypeTabBar extends StatefulWidget {
  const MediaTypeTabBar({
    super.key,
    required this.types,
    required this.selected,
    required this.onSelected,
  });

  final List<MediaType> types;
  final MediaType selected;
  final ValueChanged<MediaType> onSelected;

  @override
  State<MediaTypeTabBar> createState() => _MediaTypeTabBarState();
}

class _MediaTypeTabBarState extends State<MediaTypeTabBar> {
  final ScrollController _scrollController = ScrollController();
  bool _isScrolled = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      final isScrolled = _scrollController.offset > 5;
      if (isScrolled != _isScrolled) {
        setState(() {
          _isScrolled = isScrolled;
        });
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 41,
      padding: const EdgeInsets.only(left: 8),
      child: ShaderMask(
        shaderCallback: (Rect bounds) {
          return LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [
              _isScrolled ? Colors.transparent : Colors.black,
              Colors.black,
              Colors.black,
              Colors.transparent,
            ],
            stops: const [0.0, 0.15, 0.85, 1.0],
          ).createShader(bounds);
        },
        blendMode: BlendMode.dstIn,
        child: SingleChildScrollView(
          controller: _scrollController,
          scrollDirection: Axis.horizontal,
          physics: const BouncingScrollPhysics(),
          child: Row(
            children: [
              for (var i = 0; i < widget.types.length; i++) ...[
                _buildTab(widget.types[i], widget.types[i] == widget.selected),
                if (i < widget.types.length - 1)
                  const SizedBox(
                    width: 0,
                  ), // Total spacing 32px (16 padding + 0 gap + 16 padding)
              ],
              const SizedBox(width: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTab(MediaType type, bool isSelected) {
    final label = type == MediaType.visualNovel ? 'Visual Novel' : type.label;

    return GestureDetector(
      onTap: () => widget.onSelected(type),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: isSelected
            ? ShapeDecoration(
                color: Colors.black.withValues(alpha: 0.20),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(54.95),
                ),
              )
            : null,
        child: isSelected
            ? Text(
                label,
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.5,
                  height: 1.2,
                ),
              )
            : Opacity(
                opacity: 0.30,
                child: Text(
                  label,
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                    height: 1.2,
                    shadows: [
                      Shadow(
                        offset: const Offset(0, 4),
                        blurRadius: 14,
                        color: const Color(0xFF000000).withValues(alpha: 0.25),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}
