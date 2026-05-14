class Env {
  static const String name = String.fromEnvironment('ENV', defaultValue: 'dev');
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );
  static const String sentryDsn = String.fromEnvironment('SENTRY_DSN', defaultValue: '');
}
