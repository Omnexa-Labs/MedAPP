# components/

Reusable UI used by **two or more** features. Anything used by exactly one feature lives under `features/<name>/components/` and is promoted here when a second consumer appears.

Subfolders:
- `ui/` — presentation primitives (Button, Card, Input, Avatar, Badge, RoleBadge). No business logic.
- `layout/` — page-level wrappers (Screen, KeyboardAvoidingScreen, EmptyState, ListSkeleton).
- `feedback/` — Toast, ErrorBoundary, inline error banners.
- `gating/` — role/permission wrappers (`<RequirePartner>`, `<RoleGate>`). Hide or replace children based on `use-role`.

Components here MUST stay presentational + composable. If you reach for `react-query` or a global store inside one, it probably belongs in a feature instead.
