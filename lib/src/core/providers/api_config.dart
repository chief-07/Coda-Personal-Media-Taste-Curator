import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

String getApiBaseUrl() {
  if (kIsWeb) {
    final uri = Uri.base;
    // If the web app is loaded from port 8085 (which is the http-server LAN preview),
    // we want all API requests to target the backend server running on port 8080.
    if (uri.port != 8080) {
      return '${uri.scheme}://${uri.host}:8080';
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
