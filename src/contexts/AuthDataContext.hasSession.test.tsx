/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthDataProvider } from "@/contexts/AuthDataContext";
import { useHasSession, useSignedIn } from "./AuthDataContext";

function wrapper({ children }: { children: ReactNode }) {
  return <AuthDataProvider hasSessionHint>{children}</AuthDataProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The status bar's first `/api/client-status` used to wait for `/api/client-nav`
 * to resolve, because the only way to know whether anyone was signed in was that
 * payload. Every page then paid two sequential round trips for the bar alone. The
 * server now hands down a cookie-presence hint so the request can start with the
 * first paint.
 */
describe("useHasSession", () => {
  it("reports a session from the server hint before the auth bootstrap resolves", () => {
    // A bootstrap that never resolves: exactly the window the hint exists for.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    const { result } = renderHook(() => useHasSession(), { wrapper });
    expect(result.current).toBe(true);
  });

  it("stays false without the hint, so an anonymous visitor makes no per-user request", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    const { result } = renderHook(() => useHasSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthDataProvider>{children}</AuthDataProvider>
      ),
    });
    expect(result.current).toBe(false);
  });

  it("keeps fetching in an isolated render, like its sibling accessors", () => {
    const { result } = renderHook(() => useHasSession());
    expect(result.current).toBe(true);
  });

  it("is not the same question as useSignedIn", () => {
    // The wire feed needs a resolved character, not merely a possible session.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    const { result } = renderHook(
      () => ({ hasSession: useHasSession(), signedIn: useSignedIn() }),
      { wrapper }
    );
    expect(result.current.hasSession).toBe(true);
    expect(result.current.signedIn).toBe(false);
  });
});
