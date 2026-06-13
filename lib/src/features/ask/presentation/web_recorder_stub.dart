import 'package:record/record.dart';

class CodaAudioRecorder {
  final _recorder = AudioRecorder();

  Future<bool> hasPermission() {
    return _recorder.hasPermission();
  }

  Future<void> start({required String path}) async {
    await _recorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc),
      path: path,
    );
  }

  Future<String?> stop() {
    return _recorder.stop();
  }

  void dispose() {
    _recorder.dispose();
  }
}
