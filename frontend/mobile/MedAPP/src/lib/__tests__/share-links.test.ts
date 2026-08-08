// Share links — what a share is allowed to promise.
//
// The defect these lock is the one that makes a bad link worse than none: a
// share leaves the app. A URL that 404s, or that points at a LAN dev server, is
// visible to people who are not our users and cannot be taken back.
//
// SEAM: `expo-linking` and `expo-constants`. Both are mocked so a case can put
// the module in a runtime it would otherwise take an Expo Go session or a web
// build to reach.

const mockCreateURL = jest.fn();
const mockParse = jest.fn();
jest.mock("expo-linking", () => ({
  createURL: (...a: unknown[]) => mockCreateURL(...a),
  parse: (...a: unknown[]) => mockParse(...a),
}));

const mockExpoConfig: { scheme?: string | string[] } = { scheme: "medapp" };
jest.mock("expo-constants", () => ({
  __esModule: true,
  get default() {
    return { expoConfig: mockExpoConfig };
  },
}));

import { shareLinkFor, shareLinkLine } from "../share-links";

/**
 * Stand in for a real build: `createURL` composes on the app's own scheme, and
 * `parse` reports that scheme back. Mirrors SDK 55's documented behaviour
 * (`<scheme>://path`, two slashes by default).
 */
function runtimeIsABuild() {
  mockCreateURL.mockImplementation(
    (path: string, opts?: { queryParams?: Record<string, string> }) => {
      const query = Object.entries(opts?.queryParams ?? {})
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
      return `medapp:/${path}${query ? `?${query}` : ""}`;
    },
  );
  mockParse.mockReturnValue({ scheme: "medapp" });
}

beforeEach(() => {
  mockCreateURL.mockReset();
  mockParse.mockReset();
  mockExpoConfig.scheme = "medapp";
  runtimeIsABuild();
});

describe("the link a share carries", () => {
  it("addresses the post detail route by id", () => {
    const url = shareLinkFor({ kind: "post", id: "p-42" });
    expect(url).toBe("medapp://post-detail?id=p-42");
    // The route group is NOT in the URL. `src/app/(app)/post-detail.tsx` is
    // reached at `/post-detail`; a path containing "(app)" matches nothing.
    expect(url).not.toContain("(app)");
    expect(mockCreateURL).toHaveBeenCalledWith("/post-detail", { queryParams: { id: "p-42" } });
  });

  it("uses each screen's OWN param name, not a shared one", () => {
    // hospital-detail reads `hospitalId` and pharmacy-detail reads `pharmacyId`.
    // A single `id` for all three would open both facility screens with no
    // record — the not-found panel, from a link we generated ourselves.
    expect(shareLinkFor({ kind: "hospital", id: "h-1" })).toBe(
      "medapp://hospital-detail?hospitalId=h-1",
    );
    expect(shareLinkFor({ kind: "pharmacy", id: "ph-1" })).toBe(
      "medapp://pharmacy-detail?pharmacyId=ph-1",
    );
  });

  it("prefixes the line so a recipient without the app knows what it is", () => {
    expect(shareLinkLine({ kind: "post", id: "p-42" })).toBe(
      "Open in MedApp: medapp://post-detail?id=p-42",
    );
  });
});

describe("the runtimes where there is NO link", () => {
  it("refuses the Expo Go LAN URL", () => {
    // `exp://192.168.1.20:8081/--/post-detail` resolves on one developer's
    // machine and nowhere else. Sending it to someone is sending a dead link.
    mockCreateURL.mockReturnValue("exp://192.168.1.20:8081/--/post-detail?id=p-42");
    mockParse.mockReturnValue({ scheme: "exp" });
    expect(shareLinkFor({ kind: "post", id: "p-42" })).toBeNull();
    expect(shareLinkLine({ kind: "post", id: "p-42" })).toBeNull();
  });

  it("refuses a localhost web URL", () => {
    mockCreateURL.mockReturnValue("https://localhost:19006/post-detail?id=p-42");
    mockParse.mockReturnValue({ scheme: "https" });
    expect(shareLinkFor({ kind: "post", id: "p-42" })).toBeNull();
  });

  it("refuses when there is no manifest scheme to check against", () => {
    mockExpoConfig.scheme = undefined;
    expect(shareLinkFor({ kind: "post", id: "p-42" })).toBeNull();
    // And does not even ask, so a bare host cannot be handed a guessed scheme.
    expect(mockCreateURL).not.toHaveBeenCalled();
  });

  it("survives createURL throwing", () => {
    mockCreateURL.mockImplementation(() => {
      throw new Error("no scheme in manifest");
    });
    expect(shareLinkFor({ kind: "post", id: "p-42" })).toBeNull();
  });

  it("refuses a blank id rather than linking to the route with none", () => {
    // `/post-detail` with no id renders the not-available panel. That is the
    // fabricated-link failure in its purest form: a URL that always fails.
    expect(shareLinkFor({ kind: "post", id: "" })).toBeNull();
    expect(shareLinkFor({ kind: "post", id: "   " })).toBeNull();
  });
});

describe("what a link may never carry", () => {
  it("puts nothing in the query string but the resource id", () => {
    // The app once shipped deep-link routes that granted a session. Nothing
    // here may carry a credential or a person: one param, one opaque id.
    for (const url of [
      shareLinkFor({ kind: "post", id: "p-42" }),
      shareLinkFor({ kind: "hospital", id: "h-1" }),
      shareLinkFor({ kind: "pharmacy", id: "ph-1" }),
    ]) {
      const query = url!.split("?")[1] ?? "";
      expect(query.split("&")).toHaveLength(1);
      expect(query).not.toMatch(
        /token|session|auth|jwt|bearer|password|otp|patient|user|email|phone/i,
      );
    }
  });

  it("emits no https link — there is no site to host one", () => {
    // Universal Links / App Links would need an apple-app-site-association and
    // an assetlinks.json on a domain we control. Neither exists, so neither
    // does an https share link.
    expect(shareLinkFor({ kind: "post", id: "p-42" })).not.toMatch(/^https?:/);
  });
});
