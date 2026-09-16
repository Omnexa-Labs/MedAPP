"use client";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth.store";

export function inventoryError(error: unknown) {
  const failure = error as {
    response?: { status?: number; data?: { detail?: unknown } };
  };
  const status = failure?.response?.status;
  const detail = failure?.response?.data?.detail;
  const messages =
    typeof detail === "string"
      ? [detail]
      : Array.isArray(detail)
        ? detail.flatMap((item) =>
            typeof item?.msg === "string" ? [item.msg] : [],
          )
        : [];
  return {
    status,
    uncertain: !status || status >= 500,
    message:
      messages.join(" ") ||
      "The request could not be confirmed. Check your connection and try again.",
  };
}

export function useInventoryAction<T>(
  success: (result: T) => void,
  versioned = false,
) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const key = useRef<string | null>(null);
  const scope = useAuthStore((state) => state.scope);
  useEffect(() => () => controller.current?.abort(), []);
  async function run(
    send: (signal: AbortSignal, requestId: string) => Promise<T>,
  ) {
    if (controller.current || !scope) return;
    const active = new AbortController();
    controller.current = active;
    key.current ||= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const result = await send(active.signal, key.current);
      if (active.signal.aborted || useAuthStore.getState().scope !== scope)
        return;
      setUncertain(false);
      success(result);
    } catch (error) {
      if (active.signal.aborted || useAuthStore.getState().scope !== scope)
        return;
      const failure = inventoryError(error);
      setError(failure.message);
      setUncertain(failure.uncertain);
      setConflict(versioned && failure.status === 409);
      if (!failure.uncertain) key.current = null;
    } finally {
      controller.current = null;
      if (!active.signal.aborted) setBusy(false);
    }
  }
  return {
    run,
    busy,
    error,
    uncertain,
    conflict,
    locked: busy || uncertain || conflict,
  };
}

export function moneyToCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("Enter an amount with at most two decimal places.");
  const [units, fraction = ""] = value.split(".");
  const cents = Number(units) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 2147483647)
    throw new Error("This amount is too large.");
  return cents;
}
