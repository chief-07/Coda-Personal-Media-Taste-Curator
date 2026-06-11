import 'dart:typed_data';

/// Non-web stub. This is never called on native platforms.
Future<(Uint8List, String)?> pickImageFileWeb() async {
  throw UnsupportedError('pickImageFileWeb is only available on web');
}
