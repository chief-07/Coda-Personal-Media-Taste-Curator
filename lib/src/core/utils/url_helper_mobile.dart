import 'package:url_launcher/url_launcher.dart';

Future<void> launchBrowserUrl(String urlString) async {
  final Uri uri = Uri.parse(urlString);
  if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
    throw 'Could not launch $urlString';
  }
}
