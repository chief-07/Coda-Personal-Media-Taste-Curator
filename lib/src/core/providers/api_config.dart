import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

String getApiBaseUrl() {
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
    // If running on native (APK), try to read CODA_API_URL from .env.
    final envUrl = dotenv.env['CODA_API_URL'];
    if (envUrl != null && envUrl.isNotEmpty) {
      return envUrl;
    }
    // Fallback to Android emulator loopback or localhost:8080
    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:8080';
      }
    } catch (_) {}
    return 'http://localhost:8080';
  }
}
