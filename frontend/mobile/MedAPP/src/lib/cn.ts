// Tiny className joiner for NativeWind. No deps — mirrors the template-string
// pattern the screens already use, just centralised so primitives can accept a
// `className` override cleanly. Falsy entries are dropped; later entries win
// only by convention (NativeWind has no tailwind-merge — avoid conflicting
// utilities in the same call).
export type ClassValue = string | false | null | undefined;

export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ");
}
