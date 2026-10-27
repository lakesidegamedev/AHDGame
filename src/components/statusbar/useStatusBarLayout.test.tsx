/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthDataProvider } from "@/contexts/AuthDataContext";
import { useStatusBarLayout } from "./useStatusBarLayout";

const LAYOUT_KEY = "statusBarLayout";

function wrapper({ children }: { children: ReactNode }) {
  return <AuthDataProvider hasSessionHint>{children}</AuthDataProvider>;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/**
 * The bar layout is part of the `/api/client-status` URL, so this hook used to
 * hold the status bar's only request behind the auth bootstrap: nothing could be
 * asked for until `/api/client-nav` said what layout the account prefers. The
 * device already knows, so the request starts with the first paint and the
 * account preference only corrects it when the two disagree.
 */
describe("useStatusBarLayout", () => {
  it("answers from the device without waiting for the auth bootstrap", () => {
    localStorage.setItem(LAYOUT_KEY, "corp");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );

    const { result } = renderHook(() => useStatusBarLayout(), { wrapper });

    expect(result.current.layout).toBe("corp");
    expect(result.current.layoutSynced).toBe(true);
  });

  it("defaults to standard when the device has never chosen one", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );

    const { result } = renderHook(() => useStatusBarLayout(), { wrapper });

    expect(result.current.layout).toBe("standard");
    expect(result.current.layoutSynced).toBe(true);
  });

  it("adopts the account preference once auth resolves, and stores it", async () => {
    localStorage.setItem(LAYOUT_KEY, "standard");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ user: { id: "u1", statusBarLayout: "full" } }), {
            status: 200,
          })
      )
    );

    const { result } = renderHook(() => useStatusBarLayout(), { wrapper });

    // First paint already has an answer, so the first request is not delayed.
    expect(result.current.layout).toBe("standard");
    await waitFor(() => expect(result.current.layout).toBe("full"));
    expect(localStorage.getItem(LAYOUT_KEY)).toBe("full");
  });

  it("ignores an invalid stored value", () => {
    localStorage.setItem(LAYOUT_KEY, "enormous");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );

    const { result } = renderHook(() => useStatusBarLayout(), { wrapper });

    expect(result.current.layout).toBe("standard");
  });
});
