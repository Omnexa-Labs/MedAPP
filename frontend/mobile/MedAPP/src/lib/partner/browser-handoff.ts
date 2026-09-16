import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { client, type RequestOptions } from "@/lib/api/client";
import { config } from "@/lib/config";

interface PortalOptions {
  endpoint: string;
  storageKey: string;
  returnRoute: string;
  origin: (options: { portalOrigin?: string }) => string;
  label: string;
  applicationDetails?: boolean;
  pharmacyWorkspace?: boolean;
}
export function createPortalHandoff(portal: PortalOptions) {
  const issue = (message: string) => new Error(message.replaceAll("onboarding", portal.label));

  const path = portal.endpoint;
  const pendingKey = portal.storageKey;
  const nativeReturn = `medapp://${portal.returnRoute}`;
  interface ReturnMarker {
    owner: string;
    state: string;
    expiresAt: number;
  }
  let markerOperations: Promise<unknown> = Promise.resolve();
  function markerTask<T>(work: () => Promise<T>): Promise<T> {
    const next = markerOperations.then(work, work);
    markerOperations = next.catch(() => {});
    return next;
  }
  function marker(value: string | null): ReturnMarker | null {
    try {
      const parsed = value ? JSON.parse(value) : null;
      return parsed &&
        typeof parsed.owner === "string" &&
        typeof parsed.state === "string" &&
        /^[A-Za-z0-9_-]{32,64}$/.test(parsed.state) &&
        Number.isFinite(parsed.expiresAt)
        ? parsed
        : null;
    } catch {
      return null;
    }
  }
  async function clearNativeMarker(owner: string, state: string) {
    await markerTask(async () => {
      const saved = marker(await AsyncStorage.getItem(pendingKey));
      if (saved?.owner === owner && saved.state === state)
        await AsyncStorage.removeItem(pendingKey);
    });
  }
  interface Handoff {
    handoff_id: string;
    url: string;
    expires_in: number;
  }
  interface Options extends RequestOptions {
    owner: string;
    applicationId?: string;
    pharmacyId?: string;
    portalOrigin?: string;
  }

  function validateOnboardingLink(value: string, expected: string): string {
    if (!expected) throw issue("Opening this portal from MedApp is not configured yet.");
    const url = new URL(value);
    const base = new URL(expected);
    const local = ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(base.hostname);
    if (
      (base.protocol !== "https:" &&
        !(config.appEnv === "dev" && local && base.protocol === "http:")) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      url.pathname !== "/handoff" ||
      url.search ||
      !/^#code=[A-Za-z0-9_-]{32,128}$/.test(url.hash)
    ) {
      throw issue("The onboarding website address does not match this MedApp environment.");
    }
    return url.href;
  }

  function validOnboardingReturn(value: string, returnUri: string, state: string): boolean {
    try {
      const url = new URL(value);
      return (
        value.split("?")[0] === returnUri &&
        !url.hash &&
        [...url.searchParams.keys()].join(",") === "handoff_state" &&
        url.searchParams.get("handoff_state") === state
      );
    } catch {
      return false;
    }
  }

  /** Only a matching return triggers refresh. It carries no session or role proof. */
  function consumeWebOnboardingReturn(owner: string): boolean {
    if (Platform.OS !== "web" || !window.location.search.includes("handoff_state")) return false;
    const raw = window.sessionStorage.getItem(pendingKey);
    const currentUrl = window.location.href;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    const saved = marker(raw);
    if (
      !saved ||
      saved.owner !== owner ||
      saved.expiresAt <= Date.now() ||
      !validOnboardingReturn(
        currentUrl,
        `${window.location.origin}/${portal.returnRoute}`,
        saved.state,
      )
    ) {
      throw issue(
        "This onboarding return could not be matched to your account. Refresh your saved status below.",
      );
    }
    window.sessionStorage.removeItem(pendingKey);
    return true;
  }

  /** Cold native return: this marker requests fresh server state, never grants access. */
  async function consumeNativeOnboardingReturn(owner: string, state: unknown): Promise<boolean> {
    if (Platform.OS === "web" || state === undefined) return false;
    if (typeof state !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(state))
      throw issue("The onboarding return was not recognized. Refresh your saved status below.");
    return markerTask(async () => {
      const saved = marker(await AsyncStorage.getItem(pendingKey));
      if (!saved || saved.owner !== owner || saved.state !== state || saved.expiresAt <= Date.now())
        throw issue(
          "This onboarding return could not be matched to your account. Refresh your saved status below.",
        );
      await AsyncStorage.removeItem(pendingKey);
      return true;
    });
  }

  async function openOnboarding(options: Options): Promise<"returned" | "closed" | "opening"> {
    const current = () => !options.signal?.aborted && options.isSessionCurrent?.() !== false;
    if (!current()) throw issue("Your sign-in changed. Open this screen again.");
    if (portal.pharmacyWorkspace && (!options.pharmacyId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.pharmacyId)))
      throw issue('Reload your pharmacy workspace before opening it.');
    const returnUri =
      Platform.OS === "web" ? `${window.location.origin}/${portal.returnRoute}` : nativeReturn;
    const state = Crypto.randomUUID().replaceAll("-", "");
    const proof = await client.post<Handoff>(
      path,
      {
        ...(portal.applicationDetails ? { application_id: options.applicationId || null } : {}),
        ...(portal.pharmacyWorkspace ? { pharmacy_id: options.pharmacyId } : {}),
        return_uri: returnUri,
        return_state: state,
      },
      options,
    );
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proof.handoff_id))
      throw issue("The onboarding link could not be prepared. Try again.");
    const cancel = () =>
      client
        .delete(`${path}/${proof.handoff_id}`, {
          isSessionCurrent: options.isSessionCurrent,
        })
        .catch(() => {});
    let webOpened = false;
    let nativeOpened = false;
    let clearMarker = true;
    const dismiss = () => {
      if (nativeOpened) {
        try {
          WebBrowser.dismissAuthSession();
        } catch {
          /* Already closed. */
        }
      }
    };
    options.signal?.addEventListener("abort", dismiss);
    try {
      if (!current()) {
        throw issue("Your sign-in changed. Open this screen again.");
      }
      const url = validateOnboardingLink(proof.url, portal.origin(options));
      if (Platform.OS === "web") {
        window.sessionStorage.setItem(
          pendingKey,
          JSON.stringify({
            owner: options.owner,
            state,
            expiresAt: Date.now() + 12 * 60 * 60 * 1000,
          }),
        );
        // Same-tab navigation avoids browsers blocking a popup after the API request.
        window.location.assign(url);
        webOpened = true;
        return "opening";
      }
      await markerTask(() =>
        AsyncStorage.setItem(
          pendingKey,
          JSON.stringify({
            owner: options.owner,
            state,
            expiresAt: Date.now() + 12 * 60 * 60 * 1000,
          }),
        ),
      );
      if (!current()) throw issue("Your sign-in changed. Open this screen again.");
      nativeOpened = true;
      clearMarker = false;
      const result = await WebBrowser.openAuthSessionAsync(url, returnUri, {
        preferEphemeralSession: true,
      });
      clearMarker = current();
      if (!current()) return "closed";
      if (result.type !== "success") return "closed";
      if (!validOnboardingReturn(result.url, returnUri, state))
        throw issue("The onboarding return was not recognized. Refresh your saved status below.");
      return "returned";
    } finally {
      options.signal?.removeEventListener("abort", dismiss);
      // A consumed proof cannot be reused; cancellation also invalidates an unused one.
      if (!webOpened) await cancel();
      if (Platform.OS !== "web" && clearMarker)
        await clearNativeMarker(options.owner, state).catch(() => {});
    }
  }

  return {
    openOnboarding,
    consumeNativeOnboardingReturn,
    consumeWebOnboardingReturn,
    validateOnboardingLink,
    validOnboardingReturn,
  };
}
