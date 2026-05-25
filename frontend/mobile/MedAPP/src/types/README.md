# types/

Global TypeScript types — domain shapes used by 2+ features.

Planned:
- `user.ts` — `User`, `Role`, `PartnerStatus`, `PartnerKind` (practitioner / pharmacy / hospital).
- `api.ts` — `ApiError`, `Paginated<T>`, common envelope shapes.

Feature-only types live in `features/<name>/types.ts`. Promote here when a second feature imports the same shape.

Where possible, derive types from zod schemas in `lib/validation/` (`type User = z.infer<typeof UserSchema>`) so runtime validation and compile-time types stay in lockstep.
