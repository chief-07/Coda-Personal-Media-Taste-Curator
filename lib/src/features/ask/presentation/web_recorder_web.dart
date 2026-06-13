import 'dart:async';
import 'dart:html' as html;

class CodaAudioRecorder {
  html.MediaStream? _stream;
  html.MediaRecorder? _mediaRecorder;
  final List<html.Blob> _chunks = [];
  Completer<String?>? _stopCompleter;

  bool? _permissionGranted;
  Future<bool>? _permissionFuture;

  Future<bool> hasPermission() async {
    if (_permissionGranted == true) return true;
    if (_permissionFuture != null) return _permissionFuture!;

    final completer = Completer<bool>();
    _permissionFuture = completer.future;

    try {
      final devices = html.window.navigator.mediaDevices;
      if (devices == null) {
        _permissionGranted = false;
        completer.complete(false);
      } else {
        final stream = await devices.getUserMedia({'audio': true});
        stream.getTracks().forEach((track) => track.stop());
        _permissionGranted = true;
        completer.complete(true);
      }
    } catch (e) {
      print('Permission check error: $e');
      _permissionGranted = false;
      completer.complete(false);
    } finally {
      _permissionFuture = null;
    }

    return completer.future;
  }

  Future<void> start({required String path}) async {
    _chunks.clear();
    final devices = html.window.navigator.mediaDevices;
    if (devices == null) {
      throw UnsupportedError('MediaDevices is not supported in this browser context (insecure/HTTP).');
    }
    _stream = await devices.getUserMedia({'audio': true});
    
    _mediaRecorder = html.MediaRecorder(_stream!);
    
    _mediaRecorder!.addEventListener('dataavailable', (html.Event event) {
      final blobEvent = event as html.BlobEvent;
      if (blobEvent.data != null) {
        _chunks.add(blobEvent.data!);
      }
    });

    _mediaRecorder!.addEventListener('stop', (html.Event event) {
      if (_stopCompleter != null && !_stopCompleter!.isCompleted) {
        if (_chunks.isEmpty) {
          _stopCompleter!.complete(null);
          return;
        }
        final blob = html.Blob(_chunks, 'audio/webm');
        final blobUrl = html.Url.createObjectUrlFromBlob(blob);
        _stopCompleter!.complete(blobUrl);
      }
      _cleanup();
    });

    _mediaRecorder!.start();
  }

  Future<String?> stop() async {
    if (_mediaRecorder == null || _mediaRecorder!.state != 'recording') {
      return null;
    }
    _stopCompleter = Completer<String?>();
    _mediaRecorder!.stop();
    return _stopCompleter!.future;
  }

  void _cleanup() {
    _stream?.getTracks().forEach((track) => track.stop());
    _stream = null;
    _mediaRecorder = null;
  }

  void dispose() {
    _cleanup();
  }
}
