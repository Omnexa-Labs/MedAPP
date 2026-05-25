# components/gating/

Wrappers that conditionally render based on the current user's role / partner status.

- `<RequirePartner fallback={...}>` — renders children only if user has any partner role; otherwise shows fallback (typically a "Become a Partner" CTA).
- `<RoleGate role="practitioner">` — renders children only for that specific role.
- `<RequireAuth>` — renders children only when signed in.

These read from `hooks/use-role.ts` + `constants/capabilities.ts`. Adding a new role is one map entry, not a search-and-replace.
