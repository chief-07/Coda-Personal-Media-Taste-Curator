import 'dart:html' as html;
import 'dart:typed_data';

/// Web-only: opens a native browser file picker and returns the raw bytes + filename.
Future<(Uint8List, String)?> pickImageFileWeb() async {
  final completer = html.FileUploadInputElement();
  completer.accept = 'image/*';
  completer.click();

  await completer.onChange.first;

  final files = completer.files;
  if (files == null || files.isEmpty) return null;

  final file = files.first;
  final reader = html.FileReader();
  reader.readAsArrayBuffer(file);
  await reader.onLoad.first;

  final result = reader.result;
  if (result is ByteBuffer) {
    return (result.asUint8List(), file.name);
  } else if (result is List<int>) {
    return (Uint8List.fromList(result), file.name);
  }
  return null;
}
