import 'package:coda/src/features/home/domain/media_type.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class MediaTypeTabBar extends StatefulWidget {
  const MediaTypeTabBar({
    super.key,
    required this.types,
    required this.selected,
    required this.onSelected,
    this.onAddType,
    this.onDeleteType,
  });

  final List<MediaType> types;
  final MediaType selected;
  final ValueChanged<MediaType> onSelected;
  final ValueChanged<String>? onAddType;
  final ValueChanged<MediaType>? onDeleteType;

  @override
  State<MediaTypeTabBar> createState() => _MediaTypeTabBarState();
}

class _MediaTypeTabBarState extends State<MediaTypeTabBar> {
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _textController = TextEditingController();
  final FocusNode _addFocusNode = FocusNode();
  bool _isScrolled = false;
  bool _isAdding = false;

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
    _textController.dispose();
    _addFocusNode.dispose();
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
              for (var i = 0; i < widget.types.length; i++) ...[
                _buildTab(widget.types[i], widget.types[i] == widget.selected),
              ],
              if (widget.onAddType != null) ...[
                if (_isAdding)
                  _buildAddField()
                else
                  _buildPlusButton(),
              ],
              const SizedBox(width: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPlusButton() {
    return GestureDetector(
      onTap: () {
        setState(() {
          _isAdding = true;
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _addFocusNode.requestFocus();
        });
      },
      child: Container(
        width: 32,
        height: 32,
        margin: const EdgeInsets.only(left: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          shape: BoxShape.circle,
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.1),
          ),
        ),
        child: const Icon(
          Icons.add,
          color: Colors.white60,
          size: 18,
        ),
      ),
    );
  }

  Widget _buildAddField() {
    return Container(
      width: 150,
      height: 32,
      margin: const EdgeInsets.only(left: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _textController,
              focusNode: _addFocusNode,
              style: GoogleFonts.inter(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
              decoration: const InputDecoration(
                hintText: 'New...',
                hintStyle: TextStyle(color: Colors.white30, fontSize: 13),
                contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                border: InputBorder.none,
                isDense: true,
              ),
              textInputAction: TextInputAction.done,
              onSubmitted: (val) {
                if (val.trim().isNotEmpty) {
                  widget.onAddType?.call(val.trim());
                  setState(() {
                    _isAdding = false;
                    _textController.clear();
                  });
                }
              },
            ),
          ),
          GestureDetector(
            onTap: () {
              setState(() {
                _isAdding = false;
                _textController.clear();
              });
            },
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Icon(Icons.close, color: Colors.white30, size: 16),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTab(MediaType type, bool isSelected) {
    final label = type == MediaType.visualNovel ? 'Visual Novel' : type.label;

    return GestureDetector(
      onTap: () => widget.onSelected(type),
      onLongPress: widget.onDeleteType != null ? () => widget.onDeleteType!(type) : null,
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
