# lib/validation/

Cross-feature zod schemas — anything used by 2+ features (e.g. `EmailSchema`, `PhoneSchema`, `User` shape mirrored from backend).

Feature-only schemas live alongside the feature (`features/<name>/schema.ts`). Promote here when a second feature reaches for the same shape.

## react-hook-form + RN `<TextInput>` conventions

When wiring a field with `<Controller>`, follow this pattern:

```tsx
<Controller
  control={control}
  name="email"
  render={({ field }) => (
    <TextInput
      value={field.value ?? ""}        // RN warns on undefined
      onChangeText={field.onChange}    // TextInput emits a string, not an event
      onBlur={field.onBlur}            // needed for validate-on-blur
      ref={field.ref}                  // only if you need focus management
    />
  )}
/>
```

Use `zodResolver(schema)` from `@hookform/resolvers/zod` and derive the form type with `z.infer<typeof schema>`. Schemas should be the single source of truth for both runtime validation and TypeScript types.
