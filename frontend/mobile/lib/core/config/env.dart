/// Build-time configuration.
///
/// Override with `--dart-define`, e.g.:
///   flutter run --dart-define=ENV=dev --dart-define=API_BASE_URL=http://10.0.2.2:8000
///
/// When `USE_MOCK_API=true`, the app uses canned data instead of HTTP — useful
/// for the frontend team to develop without the backend running.
class Env {
  static const String name = String.fromEnvironment('ENV', defaultValue: 'dev');

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  static const bool useMockApi = bool.fromEnvironment('USE_MOCK_API', defaultValue: true);

  static bool get isProd => name == 'prod';
}
