# Assets

Place the following files here before the first build:

- `icon.png` — 1024×1024, app icon
- `adaptive-icon.png` — 1024×1024, Android adaptive foreground
- `splash.png` — splash screen image
- `favicon.png` — 48×48, web favicon

These paths are referenced from `app.json`. Until they exist, `expo start --web` will warn but the native app still runs.
