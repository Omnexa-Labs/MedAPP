# lib/storage/

Thin wrappers over `expo-secure-store` (for tokens / credentials) and `@react-native-async-storage/async-storage` (for non-sensitive prefs).

Decision rule:
- Sensitive (auth token, refresh token, biometric secrets) → SecureStore wrapper.
- Non-sensitive UI / preference flags (hasSeenWelcome, theme override, last-tab) → AsyncStorage wrapper.

Stores import these; features almost never should.

Biometric enrollment uses native SecureStore for a protected AES-256 key and an
AES-GCM envelope containing the current refresh token. Ordinary bearer entries are
removed before enrollment is committed. Account/key context is authenticated with
the ciphertext; capability checks never open the protected key. Enrolled access
tokens and unlocked key material remain in memory for the active app session.

Credential mutations are serialized by the auth store. Turning protection off
requires a fresh protected read and restores normal saved-session behavior. Logout
removes the envelope and protected key; the install ID is retained. Partial native
writes, cancellation and unavailable keys must not be treated as successful setup.
The auth README documents the lifecycle and required physical-device verification.
