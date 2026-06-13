import 'dart:html' as html;

Future<void> launchBrowserUrl(String urlString) async {
  html.window.open(urlString, '_blank');
}
