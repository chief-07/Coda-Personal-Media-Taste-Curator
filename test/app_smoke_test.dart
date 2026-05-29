import 'package:coda/src/app/coda_app.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  testWidgets('Coda app shows the home recommendation', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: CodaApp()));

    expect(find.text('Movies'), findsOneWidget);
    expect(find.text('Interstellar'), findsWidgets);
    expect(find.text('2h 49m'), findsWidgets);
  });
}
