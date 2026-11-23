// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

// The real effect paints into a canvas, which happy-dom does not implement.
// These tests cover when the page is covered, when it decodes, and that the
// cover never sticks, not the drawing.
const calls: string[] = [];
vi.mock("ascii-reveal/core", () => ({
  createAsciiReveal: () => ({
    shimmer: (on: boolean) => calls.push(`shimmer:${on}`),
    hide: (opts?: { instant?: boolean }) => {
      calls.push(opts?.instant ? "hide:instant" : "hide");
      return Promise.resolve();
    },
    reveal: () => {
      calls.push("reveal");
      return Promise.resolve();
    },
    update: () => undefined,
    destroy: () => calls.push("destroy"),
  }),
}));

import {
  ExperimentalPageReveal,
  MAX_WAIT_MS,
  QUIET_MS,
  REVEAL_WAITING_ATTR,
  SKELETON_GRACE_MS,
  readyToReveal,
  resetRevealHydrationForTests,
} from "./ExperimentalPageReveal";

function Page({ enabled, content }: { enabled: boolean; content: ReactNode }) {
  return <ExperimentalPageReveal enabled={enabled}>{content}</ExperimentalPageReveal>;
}

const host = () => document.querySelector(".ascii-reveal-host") as HTMLElement | null;

beforeEach(() => {
  calls.length = 0;
  resetRevealHydrationForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("readyToReveal", () => {
  const base = { startedAt: 0, lastMutationAt: 0, textSince: 0, stillLoading: false };

  it("waits for real text", () => {
    expect(readyToReveal({ ...base, now: 1000, textSince: null })).toBe(false);
  });

  it("waits for the page to hold still", () => {
    expect(readyToReveal({ ...base, now: 1000, lastMutationAt: 1000 - QUIET_MS + 1 })).toBe(false);
    expect(readyToReveal({ ...base, now: 1000, lastMutationAt: 1000 - QUIET_MS })).toBe(true);
  });

  it("gives a lingering skeleton a short grace once text is in", () => {
    const loading = { ...base, stillLoading: true, textSince: 100 };
    expect(readyToReveal({ ...loading, now: 100 + SKELETON_GRACE_MS - 1 })).toBe(false);
    expect(readyToReveal({ ...loading, now: 100 + SKELETON_GRACE_MS })).toBe(true);
  });

  it("never holds a page past the cap", () => {
    expect(
      readyToReveal({ ...base, now: MAX_WAIT_MS, textSince: null, lastMutationAt: MAX_WAIT_MS })
    ).toBe(true);
  });
});

describe("ExperimentalPageReveal", () => {
  it("leaves the page alone when the player has not opted in", () => {
    pathname = "/profile";
    render(<Page enabled={false} content={<p>Page content here</p>} />);
    expect(host()).toBeNull();
    expect(screen.getByText("Page content here")).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("skips pages without the site chrome and the marketing pages", () => {
    pathname = "/login";
    render(<Page enabled content={<p>Sign in to play</p>} />);
    expect(host()).toBeNull();
    cleanup();
    pathname = "/about/history";
    render(<Page enabled content={<p>Our history page</p>} />);
    expect(host()).toBeNull();
    expect(calls).toEqual([]);
  });

  it("does not replay a server-rendered page that arrived whole", () => {
    pathname = "/profile";
    render(<Page enabled content={<p>Your profile and holdings</p>} />);
    expect(host()?.hasAttribute(REVEAL_WAITING_ATTR)).toBe(false);
    act(() => {
      vi.advanceTimersByTime(MAX_WAIT_MS * 2);
    });
    expect(calls).toEqual([]);
  });

  it("does not hide a server-rendered page that still has a loading panel", () => {
    pathname = "/market";
    render(
      <Page
        enabled
        content={
          <div>
            <p>Stocks, bonds and funds</p>
            <div className="animate-pulse" aria-hidden />
          </div>
        }
      />
    );
    expect(host()?.hasAttribute(REVEAL_WAITING_ATTR)).toBe(false);
    act(() => {
      vi.advanceTimersByTime(MAX_WAIT_MS * 2);
    });
    expect(calls).toEqual([]);
  });

  it("covers a server-rendered skeleton and decodes once real content lands", () => {
    pathname = "/profile";
    const { rerender } = render(
      <Page enabled content={<div className="animate-pulse" aria-hidden />} />
    );
    expect(host()?.hasAttribute(REVEAL_WAITING_ATTR)).toBe(true);
    expect(calls).toEqual(["shimmer:true"]);

    rerender(<Page enabled content={<p>Your profile and holdings</p>} />);
    act(() => {
      vi.advanceTimersByTime(QUIET_MS + 100);
    });
    expect(calls).toEqual(["shimmer:true", "shimmer:false", "hide:instant", "reveal"]);
    expect(host()?.hasAttribute(REVEAL_WAITING_ATTR)).toBe(false);
  });

  it("covers an in-app navigation from its first paint, then decodes", () => {
    pathname = "/profile";
    const { rerender } = render(<Page enabled content={<p>Your profile and holdings</p>} />);
    expect(calls).toEqual([]);

    pathname = "/corporation/2";
    rerender(<Page enabled content={<div className="animate-pulse" aria-hidden />} />);
    const covered = host();
    expect(covered?.hasAttribute(REVEAL_WAITING_ATTR)).toBe(true);

    rerender(<Page enabled content={<p>Corporation two overview</p>} />);
    act(() => {
      vi.advanceTimersByTime(QUIET_MS + 100);
    });
    expect(calls.slice(-3)).toEqual(["shimmer:false", "hide:instant", "reveal"]);
    expect(host()).toBe(covered);
    expect(host()?.hasAttribute(REVEAL_WAITING_ATTR)).toBe(false);
  });

  it("lifts the cover at the cap even if the page never settles", () => {
    pathname = "/profile";
    render(<Page enabled content={<div className="animate-pulse" aria-hidden />} />);
    act(() => {
      vi.advanceTimersByTime(MAX_WAIT_MS + 100);
    });
    expect(calls).toContain("reveal");
    expect(host()?.hasAttribute(REVEAL_WAITING_ATTR)).toBe(false);
  });

  it("does not cover a page that is already showing when it re-renders", () => {
    pathname = "/profile";
    const { rerender } = render(<Page enabled content={<p>Your profile and holdings</p>} />);
    rerender(<Page enabled content={<p>Your profile and holdings, updated</p>} />);
    expect(host()?.hasAttribute(REVEAL_WAITING_ATTR)).toBe(false);
  });
});
