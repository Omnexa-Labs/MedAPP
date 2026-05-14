import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:medapp/features/auth/presentation/login_screen.dart';

void main() {
  testWidgets('login form requires a valid email', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: LoginScreen()),
      ),
    );

    await tester.enterText(find.byKey(const Key('login.email')), 'not-an-email');
    await tester.enterText(find.byKey(const Key('login.password')), 'short');
    await tester.tap(find.byKey(const Key('login.submit')));
    await tester.pump();

    expect(find.text('Enter a valid email'), findsOneWidget);
  });
}
