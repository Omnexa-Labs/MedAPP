# lib/

Framework-agnostic helpers. **No JSX, no hooks, no React.** If it could in principle be unit-tested without rendering a component, it belongs here.

Subfolders:
- `api/` — HTTP client (fetch wrapper), auth interceptor, error mapping. The only place network plumbing lives.
- `storage/` — SecureStore (tokens) and AsyncStorage (prefs) wrappers. Features never import the storage libs directly; they import these.
- `validation/` — shared zod schemas. Feature-local schemas can live in `features/<name>/schema.ts` instead.
- `format/` — date, currency, medical units (mg/dL ↔ mmol/L, kg ↔ lb, °C ↔ °F).
- `partner/` — partner-onboarding launcher (`open-onboarding.ts`). Isolates the "open the web onboarding URL" behavior so the rest of the app stays oblivious to how onboarding is hosted.

If something needs React (`useState`, `useEffect`), it goes to `hooks/` (cross-cutting) or `features/<name>/hooks/` (feature-local) — not here.
