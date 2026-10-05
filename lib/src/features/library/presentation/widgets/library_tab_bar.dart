import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

enum LibraryTab { settings, lists, archive, seen }

class LibraryTabBar extends StatefulWidget {
  const LibraryTabBar({
    super.key,
    required this.selected,
    required this.onSelected,
  });

  final LibraryTab selected;
  final ValueChanged<LibraryTab> onSelected;

  @override
  State<LibraryTabBar> createState() => _LibraryTabBarState();
}

class _LibraryTabBarState extends State<LibraryTabBar> {
  final ScrollController _scrollController = ScrollController();
  bool _isScrolled = false;

  final List<LibraryTab> _types = [
    LibraryTab.settings,
    LibraryTab.archive,
    LibraryTab.lists,
    LibraryTab.seen,
  ];

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
      width: double.infinity,
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
              for (var i = 0; i < _types.length; i++) ...[
                _buildTab(_types[i], _types[i] == widget.selected),
                if (i < _types.length - 1)
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

  Widget _buildTab(LibraryTab type, bool isSelected) {
    String label;
    IconData? icon;

    switch (type) {
      case LibraryTab.settings:
        label = 'Settings';
        icon = PhosphorIconsFill.gearSix;
        break;
      case LibraryTab.lists:
        label = 'Lists';
        break;
      case LibraryTab.archive:
        label = 'Archive';
        break;
      case LibraryTab.seen:
        label = 'Seen';
        break;
    }

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
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(icon, color: Colors.white, size: 20),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    label,
                    style: GoogleFonts.inter(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5,
                      height: 1.2,
                    ),
                  ),
                ],
              )
            : Opacity(
                opacity: 0.30,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (icon != null) ...[
                      Icon(icon, color: Colors.white, size: 20),
                      const SizedBox(width: 6),
                    ],
                    Text(
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
                  ],
                ),
              ),
      ),
    );
  }
}
