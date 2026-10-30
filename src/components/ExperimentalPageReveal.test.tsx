// @vitest-environment happy-dom
import { createElement } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const auth = { user: null as null | Record<string, unknown> };
let pathname = "/dashboard";

vi.mock("@/contexts/AuthDataContext", () => ({
  useOptionalAuthMe: () => ({ user: auth.user, loading: false }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

// The real wrapper paints into a canvas, which happy-dom does not implement.
// These tests cover the opt-in gate and where it applies, not the drawing.
vi.mock("ascii-reveal", () => ({
  AsciiReveal: ({ children, ...props }: { children?: ReactNode; preset?: string }) =>
    createElement("div", { "data-testid": "ascii-reveal", "data-preset": props.preset }, children),
}));

import { ExperimentalPageReveal } from "./ExperimentalPageReveal";

function renderPage() {
  return render(
    <ExperimentalPageReveal>
      <p>Page content</p>
    </ExperimentalPageReveal>
  );
}

describe("ExperimentalPageReveal", () => {
  it("leaves the page alone when the player has not opted in", () => {
    auth.user = { experimentalFeatures: false };
    pathname = "/dashboard";
    renderPage();
    expect(screen.queryByTestId("ascii-reveal")).toBeNull();
    expect(screen.getByText("Page content")).toBeTruthy();
  });

  it("leaves the page alone for signed-out visitors", () => {
    auth.user = null;
    pathname = "/dashboard";
    renderPage();
    expect(screen.queryByTestId("ascii-reveal")).toBeNull();
  });

  it("wraps the page in the decode when the player has opted in", () => {
    auth.user = { experimentalFeatures: true };
    pathname = "/dashboard";
    renderPage();
    const wrapper = screen.getByTestId("ascii-reveal");
    expect(wrapper.dataset.preset).toBe("decode");
    expect(wrapper.textContent).toContain("Page content");
  });

  it("does not swap the wrapper in when auth resolves after the first render", () => {
    // A late flip would remount the whole page subtree, so the decision is
    // frozen at mount.
    auth.user = null;
    pathname = "/dashboard";
    const { rerender } = renderPage();
    auth.user = { experimentalFeatures: true };
    rerender(
      <ExperimentalPageReveal>
        <p>Page content</p>
      </ExperimentalPageReveal>
    );
    expect(screen.queryByTestId("ascii-reveal")).toBeNull();
  });

  it("skips pages without the site chrome", () => {
    auth.user = { experimentalFeatures: true };
    pathname = "/login";
    renderPage();
    expect(screen.queryByTestId("ascii-reveal")).toBeNull();
  });

  it("skips the lightweight marketing pages", () => {
    auth.user = { experimentalFeatures: true };
    pathname = "/about/history";
    renderPage();
    expect(screen.queryByTestId("ascii-reveal")).toBeNull();
  });
});
