import 'dart:convert';
import 'dart:ui' as dart_ui;
import 'package:coda/src/features/library/presentation/image_picker_web_stub.dart'
    if (dart.library.html) 'package:coda/src/features/library/presentation/image_picker_web.dart';
import 'package:coda/src/features/library/presentation/widgets/library_card.dart';
import 'package:coda/src/features/library/presentation/widgets/library_tab_bar.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:coda/src/core/providers/api_config.dart';

class LibraryTabNotifier extends Notifier<LibraryTab> {
  @override
  LibraryTab build() => LibraryTab.archive;
  
  void setTab(LibraryTab tab) => state = tab;
}

final libraryTabProvider = NotifierProvider<LibraryTabNotifier, LibraryTab>(LibraryTabNotifier.new);

void showAddMediaDialog(BuildContext context) {
  showDialog(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.5),
    builder: (dialogCtx) => BackdropFilter(
      filter: dart_ui.ImageFilter.blur(sigmaX: 15, sigmaY: 15),
      child: Dialog(
        backgroundColor: Colors.transparent,
        elevation: 0,
        child: const AddMediaDialogContent(),
      ),
    ),
  );
}

class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedTab = ref.watch(libraryTabProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 24),
                LibraryTabBar(
                  selected: selectedTab,
                  onSelected: (tab) => ref.read(libraryTabProvider.notifier).setTab(tab),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    layoutBuilder: (Widget? currentChild, List<Widget> previousChildren) {
                      return Stack(
                        fit: StackFit.expand,
                        children: <Widget>[
                          if (previousChildren.isNotEmpty)
                            ClipRRect(
                              borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(64),
                              ),
                              child: ShaderMask(
                                shaderCallback: (Rect bounds) {
                                  return LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      Colors.black.withValues(alpha: 0.35),
                                      Colors.black.withValues(alpha: 0.35),
                                      Colors.black.withValues(alpha: 0.20),
                                    ],
                                    stops: const [0.0, 0.65, 1.0],
                                  ).createShader(bounds);
                                },
                                blendMode: BlendMode.srcOut,
                                child: Stack(
                                  children: [
                                    Positioned.fill(
                                      child: Container(
                                        color: Colors.black.withValues(alpha: 0.01),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ...previousChildren,
                          if (currentChild != null) currentChild,
                        ],
                      );
                    },
                    transitionBuilder: (Widget child, Animation<double> animation) {
                      return FadeBlurTransition(
                        animation: animation,
                        child: child,
                      );
                    },
                    child: LibraryCard(
                      key: ValueKey(selectedTab),
                      tab: selectedTab,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class AddMediaDialogContent extends StatefulWidget {
  const AddMediaDialogContent({super.key});

  @override
  State<AddMediaDialogContent> createState() => AddMediaDialogContentState();
}

class AddMediaDialogContentState extends State<AddMediaDialogContent> {
  bool _isLoading = false;
  String _errorMessage = '';
  final _titleController = TextEditingController();
  String _selectedMediaType = 'anime';

  final List<Map<String, String>> _mediaTypes = [
    {'value': 'anime', 'label': 'Anime'},
    {'value': 'movie', 'label': 'Movie'},
    {'value': 'tv', 'label': 'TV Show'},
    {'value': 'visual novel', 'label': 'Visual Novel'},
    {'value': 'manga', 'label': 'Manga'},
    {'value': 'book', 'label': 'Book'},
    {'value': 'game', 'label': 'Game'},
  ];

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  Future<void> _pickAndDetectImage() async {
    if (kIsWeb) {
      await _pickAndDetectImageWeb();
    } else {
      await _pickAndDetectImageNative();
    }
  }

  /// Web path: uses dart:html file input — no Flutter plugin channel involved.
  Future<void> _pickAndDetectImageWeb() async {
    setState(() { _isLoading = true; _errorMessage = ''; });
    try {
      final result = await pickImageFileWeb();
      if (result == null) { setState(() { _isLoading = false; }); return; }
      final (bytes, filename) = result;
      await _sendImageBytes(bytes, filename);
    } catch (e) {
      debugPrint('Web image pick error: $e');
      setState(() {
        _isLoading = false;
        _errorMessage = 'Visual detection failed. Try manual input instead.';
      });
    }
  }

  /// Native path: uses image_picker plugin (Android / iOS).
  Future<void> _pickAndDetectImageNative() async {
    setState(() { _isLoading = true; _errorMessage = ''; });
    try {
      final picker = ImagePicker();
      final XFile? image = await picker.pickImage(source: ImageSource.gallery);
      if (image == null) { setState(() { _isLoading = false; }); return; }
      await _sendImageBytes(await image.readAsBytes(), image.name);
    } catch (e) {
      debugPrint('Native image pick error: $e');
      setState(() {
        _isLoading = false;
        _errorMessage = 'Visual detection failed. Try manual input instead.';
      });
    }
  }

  Future<void> _sendImageBytes(Uint8List bytes, String filename) async {
    try {
      final baseUrl = getApiBaseUrl();
      final targetUrl = '$baseUrl/api/detect/detect-media';

      final request = http.MultipartRequest('POST', Uri.parse(targetUrl));
      request.files.add(http.MultipartFile.fromBytes(
        'image',
        bytes,
        filename: filename,
      ));

      final streamedResponse = await request.send().timeout(const Duration(seconds: 60));
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (mounted) {
          Navigator.of(context).pop();
          final itemsList = data['items'] ?? [];
          final itemsStr = itemsList.isNotEmpty ? jsonEncode(itemsList) : null;
          context.go(Uri(
            path: '/share-receive',
            queryParameters: {
              if (itemsStr != null) 'items': itemsStr,
              'title': data['title'] ?? '',
              'media_type': data['media_type'] ?? '',
              'tags': jsonEncode(data['tags'] ?? []),
              'description': data['description'] ?? '',
              'coda_blurb': data['coda_blurb'] ?? '',
              'poster_url': data['poster_url'] ?? '',
              'ost_url': data['ost_url'] ?? '',
            },
          ).toString());
        }
      } else {
        throw Exception('Detection failed: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error sending image bytes: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Visual detection failed. Try manual input instead.';
        });
      }
    }
  }

  Future<void> _manualLookup() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() {
        _errorMessage = 'Please enter a title.';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final baseUrl = getApiBaseUrl();
      final targetUrl = '$baseUrl/api/detect/manual-lookup';

      final response = await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'title': title,
          'media_type': _selectedMediaType,
        }),
      ).timeout(const Duration(seconds: 60));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (mounted) {
          Navigator.of(context).pop(); // Close dialog
          context.go(Uri(
            path: '/share-receive',
            queryParameters: {
              'title': data['title'] ?? '',
              'media_type': data['media_type'] ?? '',
              'tags': jsonEncode(data['tags'] ?? []),
              'description': data['description'] ?? '',
              'coda_blurb': data['coda_blurb'] ?? '',
              'poster_url': data['poster_url'] ?? '',
              'ost_url': data['ost_url'] ?? '',
            },
          ).toString());
        }
      } else {
        throw Exception('Manual lookup failed with status: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error during manual lookup: $e');
      setState(() {
        _isLoading = false;
        _errorMessage = 'Failed to fetch details. Please check spelling.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: dart_ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.12),
              width: 1.0,
            ),
          ),
          child: _isLoading ? _buildLoadingState() : _buildFormState(),
        ),
      ),
    );
  }

  Widget _buildLoadingState() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 24),
        const CircularProgressIndicator(
          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
        ),
        const SizedBox(height: 24),
        Text(
          'Coda AI is curating...',
          style: GoogleFonts.inter(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildFormState() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Add to Watchlist',
              style: GoogleFonts.inter(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.5,
              ),
            ),
            IconButton(
              icon: const Icon(Icons.close, color: Colors.white60, size: 20),
              onPressed: () => Navigator.of(context).pop(),
              splashRadius: 20,
            ),
          ],
        ),
        const SizedBox(height: 20),
        
        // 1. Upload Section
        ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.white.withValues(alpha: 0.05),
            foregroundColor: Colors.white,
            elevation: 0,
            minimumSize: const Size(double.infinity, 54),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(
                color: Colors.white.withValues(alpha: 0.08),
              ),
            ),
          ),
          onPressed: _pickAndDetectImage,
          icon: const Icon(PhosphorIconsBold.imageSquare, size: 20),
          label: Text(
            'Upload Screenshot / Image',
            style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w700),
          ),
        ),
        
        const SizedBox(height: 24),
        Row(
          children: [
            const Expanded(child: Divider(color: Colors.white10)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'OR ENTER MANUALLY',
                style: GoogleFonts.inter(
                  color: Colors.white38,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1,
                ),
              ),
            ),
            const Expanded(child: Divider(color: Colors.white10)),
          ],
        ),
        const SizedBox(height: 20),
        
        // 2. Manual Fields
        Text(
          'TITLE',
          style: GoogleFonts.inter(
            color: Colors.white54,
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _titleController,
          style: GoogleFonts.inter(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            hintText: 'e.g. Steins;Gate',
            hintStyle: GoogleFonts.inter(color: Colors.white30),
            filled: true,
            fillColor: Colors.white.withValues(alpha: 0.03),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Colors.white24),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          ),
        ),
        
        const SizedBox(height: 20),
        Text(
          'MEDIA TYPE',
          style: GoogleFonts.inter(
            color: Colors.white54,
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _selectedMediaType,
          dropdownColor: const Color(0xFF16181C),
          style: GoogleFonts.inter(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            filled: true,
            fillColor: Colors.white.withValues(alpha: 0.03),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
          items: _mediaTypes.map((type) {
            return DropdownMenuItem<String>(
              value: type['value'],
              child: Text(type['label']!),
            );
          }).toList(),
          onChanged: (val) {
            if (val != null) {
              setState(() {
                _selectedMediaType = val;
              });
            }
          },
        ),
        
        if (_errorMessage.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            _errorMessage,
            style: GoogleFonts.inter(
              color: const Color(0xFFFF3B5C),
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
        
        const SizedBox(height: 28),
        
        // Actions
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(
                'Cancel',
                style: GoogleFonts.inter(
                  color: Colors.white54,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: 16),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: Colors.black,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              ),
              onPressed: _manualLookup,
              child: Text(
                'Import',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class FadeBlurTransition extends StatelessWidget {
  const FadeBlurTransition({
    super.key,
    required this.animation,
    required this.child,
  });

  final Animation<double> animation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, child) {
        final double opacity = animation.value;
        final double blur = kIsWeb ? 0.0 : (1.0 - animation.value) * 12.0;

        Widget result = child!;
        if (opacity < 1.0 && blur > 0.1) {
          result = ImageFiltered(
            imageFilter: dart_ui.ImageFilter.blur(sigmaX: blur, sigmaY: blur),
            child: result,
          );
        }
        return Opacity(
          opacity: opacity,
          child: result,
        );
      },
      child: child,
    );
  }
}
