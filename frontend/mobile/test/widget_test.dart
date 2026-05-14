import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:medapp/app.dart';

void main() {
  testWidgets('app boots to home', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MedApp()));
    expect(find.text('MedApp'), findsWidgets);
  });
}
