// Locks ErrorPanel (Figma 517:2111) — both containers, and the retry contract.
//
// The load-bearing assertions are the retry ones. The frame says Retry has no
// boolean to switch it off; this app's problem was never a missing button but a
// button that refetched nothing (ActiveMedicationsScreen's header comment:
// "flipped a local enum. Nothing refetched"). So what is asserted here is that
// the handler must hand back the request's promise, that the pending label is
// derived from that promise rather than from a flag, and that a dead end has to
// NAME its reason instead of drawing a "Try again" over the same failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { tokenColor } from "@/lib/tokens";

const mockScheme = { value: "light" as "light" | "dark" };
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: mockScheme.value, setColorScheme: jest.fn() }),
}));

import { ErrorPanel } from "../ErrorPanel";
import { Icon } from "../icons/Icon";

function code(): string {
  return ["ErrorPanel.tsx", "StatePanelShell.tsx"]
    .map((f) => readFileSync(join(__dirname, "..", f), "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

const glyph = () => screen.UNSAFE_getAllByType(Icon)[0].props as Record<string, unknown>;

const OK = { title: "We couldn't load this", body: "Check your connection and try again." };

beforeEach(() => {
  mockScheme.value = "light";
});

describe("ErrorPanel — three redundant signals", () => {
  it("renders the alert glyph, the title sentence and the retry", () => {
    render(<ErrorPanel {...OK} retry={() => Promise.resolve()} />);
    expect(glyph().chrome).toBe("error-outline");
    expect(screen.getByRole("header", { name: "We couldn't load this" })).toBeTruthy();
    expect(screen.getByText("Check your connection and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("makes `body` mandatory — an error must say what failed and what to do", () => {
    // ErrorPanel's own props only: the shared shell keeps `body` optional
    // because EmptyState's frame has a showSupportingText toggle and this one
    // deliberately does not.
    const own = readFileSync(join(__dirname, "..", "ErrorPanel.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(own).toMatch(/^\s*body: string;$/m);
    expect(own).not.toMatch(/body\?:/);
  });

  it("paints the glyph with error-container's OWN on- pair, in both modes", () => {
    render(<ErrorPanel {...OK} unrecoverable="not-found" />);
    expect(glyph().color).toBe(tokenColor("on-error-container", "light"));

    mockScheme.value = "dark";
    render(<ErrorPanel {...OK} unrecoverable="not-found" />);
    expect(glyph().color).toBe(tokenColor("on-error-container", "dark"));
  });

  it("keeps the panel body on card-surface — a fully red panel over-weights it", () => {
    const src = code();
    expect(src).toMatch(/error:\s*\{\s*fill:\s*"bg-error-container",\s*glyph:\s*"on-error-container"\s*\}/);
    expect(src).not.toMatch(/bg-error-container p-/);
  });
});

describe("ErrorPanel — Container=Card | Inline", () => {
  it("defaults to Card and renders Inline without a shell", () => {
    render(<ErrorPanel {...OK} unrecoverable="forbidden" testID="card" />);
    expect(screen.getByTestId("card")).toBeTruthy();

    render(<ErrorPanel {...OK} container="inline" unrecoverable="forbidden" testID="inline" />);
    expect(screen.getByTestId("inline")).toBeTruthy();
    expect(code()).toMatch(/container = "card"/);
  });
});

describe("ErrorPanel — a retry that cannot silently do nothing", () => {
  it("calls the handler and awaits what it returns", async () => {
    const refetch = jest.fn(() => Promise.resolve({ data: 1 }));
    render(<ErrorPanel {...OK} retry={refetch} />);
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("derives 'Retrying…' from the promise, not from a flag a screen must set", async () => {
    let settle: (v: unknown) => void = () => {};
    const refetch = jest.fn(() => new Promise((resolve) => (settle = resolve)));
    render(<ErrorPanel {...OK} retry={refetch} retryAccessibilityLabel="Retry loading this" />);

    fireEvent.press(screen.getByLabelText("Retry loading this"));
    await waitFor(() => expect(screen.getByText("Retrying…")).toBeTruthy());
    // Disabled and marked busy while in flight, so it cannot be pressed twice.
    expect(screen.getByLabelText("Retry loading this").props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });

    await act(async () => {
      settle(undefined);
    });
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("also honours a query's own isFetching, OR-ed with its own tracking", () => {
    render(<ErrorPanel {...OK} retry={() => Promise.resolve()} retrying />);
    expect(screen.getByText("Retrying…")).toBeTruthy();
  });

  it("keeps a stable a11y label across the swap when one is given", async () => {
    let settle: (v: unknown) => void = () => {};
    render(
      <ErrorPanel
        {...OK}
        retry={() => new Promise((resolve) => (settle = resolve))}
        retryAccessibilityLabel="Retry loading appointments"
      />,
    );
    fireEvent.press(screen.getByLabelText("Retry loading appointments"));
    await waitFor(() => expect(screen.getByText("Retrying…")).toBeTruthy());
    expect(screen.getByLabelText("Retry loading appointments")).toBeTruthy();
    await act(async () => {
      settle(undefined);
    });
  });

  it("throws in dev when the handler returns something that is not a promise", () => {
    // The type already rejects `() => setState(x)`. This is the cast that got
    // past it, and it is the exact shape of the retries this app had to unship.
    const noop = (() => {
      /* flips a local enum, refetches nothing */
    }) as unknown as () => Promise<unknown>;
    render(<ErrorPanel {...OK} retry={noop} />);
    expect(() => fireEvent.press(screen.getByRole("button", { name: "Try again" }))).toThrow(
      /must return the promise of the request it re-issues/,
    );
  });

  it("types the handler as Promise-returning, with no void escape hatch", () => {
    const src = code();
    expect(src).toMatch(/export type RetryHandler = \(\) => Promise<unknown>;/);
    expect(src).not.toMatch(/RetryHandler = \(\) => void/);
    expect(src).not.toMatch(/Promise<unknown> \| void/);
    expect(src).not.toMatch(/void \| Promise<unknown>/);
  });

  it("carries no trailing arrow — a retry does not go anywhere", () => {
    render(<ErrorPanel {...OK} retry={() => Promise.resolve()} />);
    expect(screen.UNSAFE_getAllByType(Icon).map((i) => i.props.chrome)).not.toContain("arrow-forward");
  });
});

describe("ErrorPanel — a dead end has to name itself", () => {
  it("draws no retry for an unrecoverable failure", () => {
    render(<ErrorPanel {...OK} unrecoverable="no-identifier" />);
    expect(screen.queryByText("Try again")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each(["no-identifier", "not-found", "forbidden", "section-unavailable"] as const)(
    "accepts the named reason %s",
    (reason) => {
      render(<ErrorPanel {...OK} unrecoverable={reason} />);
      expect(screen.getByText(OK.title)).toBeTruthy();
    },
  );

  it("allows a way OUT, which is not a way to re-run the failed request", () => {
    const onPress = jest.fn();
    render(
      <ErrorPanel
        {...OK}
        unrecoverable="not-found"
        action={{ label: "Back to patient roster", onPress }}
      />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Back to patient roster" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps `retry` and `unrecoverable` mutually exclusive at the type level", () => {
    const src = code();
    expect(src).toMatch(/retry: RetryHandler;[\s\S]{0,600}unrecoverable\?: never;/);
    expect(src).toMatch(/unrecoverable: UnrecoverableReason;[\s\S]{0,600}retry\?: never;/);
  });

  it("makes the reason a closed union, so `grep unrecoverable` lists every dead end", () => {
    const src = code();
    expect(src).toMatch(/export type UnrecoverableReason =/);
    expect(src).not.toMatch(/UnrecoverableReason =[\s\S]{0,200}\| string/);
  });
});
