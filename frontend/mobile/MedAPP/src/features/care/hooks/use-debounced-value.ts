import { useEffect, useState } from "react";

/**
 * Returns a copy of `value` that only updates after `delayMs` of
 * inactivity. Used to keep the directory search from firing a network
 * call on every keystroke.
 *
 * 250ms is the upper edge of "feels instant" while being long enough
 * that two-finger typers don't fire intermediate requests.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
