import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:medapp/app.dart';

void main() {
  testWidgets('app boots without throwing', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: MedApp()));
    await tester.pump(); // let the splash settle one frame
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
