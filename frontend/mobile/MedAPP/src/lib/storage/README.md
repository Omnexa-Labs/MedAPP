# lib/storage/

Thin wrappers over `expo-secure-store` (for tokens / credentials) and `@react-native-async-storage/async-storage` (for non-sensitive prefs).

Decision rule:
- Sensitive (auth token, refresh token, biometric secrets) → SecureStore wrapper.
- Non-sensitive UI / preference flags (hasSeenWelcome, theme override, last-tab) → AsyncStorage wrapper.

Stores import these; features almost never should.
