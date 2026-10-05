import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

String getApiBaseUrl() {
  const defineUrl = String.fromEnvironment('CODA_API_URL');
  final envUrl = defineUrl.isNotEmpty ? defineUrl : dotenv.env['CODA_API_URL'];
  if (envUrl != null && envUrl.isNotEmpty) {
    if (kIsWeb) {
      final uri = Uri.base;
      if (uri.host == 'localhost' || uri.host == '127.0.0.1' || RegExp(r'^\d+\.\d+\.\d+\.\d+$').hasMatch(uri.host)) {
        if (uri.port != 8080 && uri.port != 8443) {
          final targetPort = uri.scheme == 'https' ? 8443 : 8080;
          return '${uri.scheme}://${uri.host}:$targetPort';
        }
        return uri.origin;
      }
      if (uri.host.endsWith('.onrender.com')) {
        return uri.origin;
      }
    }
    return envUrl;
  }

  if (kIsWeb) {
    final uri = Uri.base;
    // If the web app is loaded from some other port (e.g. dev server),
    // point to the backend server.
    // If the scheme is https, point to 8443. If http, point to 8080.
    if (uri.port != 8080 && uri.port != 8443) {
      final targetPort = uri.scheme == 'https' ? 8443 : 8080;
      return '${uri.scheme}://${uri.host}:$targetPort';
    }
    return uri.origin;
  } else {
    // Fallback to Android emulator loopback or localhost:8080
    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:8080';
      }
    } catch (_) {}
    return 'http://localhost:8080';
  }
}
