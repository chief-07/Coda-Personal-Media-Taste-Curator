import 'package:coda/src/app/router.dart';
import 'package:coda/src/core/theme/app_theme.dart';
import 'package:flutter/material.dart';

class CodaApp extends StatelessWidget {
  const CodaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Coda',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      routerConfig: codaRouter,
    );
  }
}
