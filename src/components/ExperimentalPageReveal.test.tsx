// @vitest-environment happy-dom
import { createElement } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

// The real wrapper paints into a canvas, which happy-dom does not implement.
// These tests cover the opt-in gate, where it applies, and that a path change
// remounts it, not the drawing.
vi.mock("ascii-reveal", () => ({
  AsciiReveal: ({
    children,
    preset,
    revealOnMount,
  }: {
    children?: ReactNode;
    preset?: string;
    revealOnMount?: boolean;
  }) =>
    createElement(
      "div",
      {
        "data-testid": "ascii-reveal",
        "data-preset": preset,
        "data-reveal-on-mount": String(revealOnMount),
      },
      children
    ),
}));

import { ExperimentalPageReveal } from "./ExperimentalPageReveal";

function renderPage(enabled: boolean, content = "Page content") {
  return render(
    <ExperimentalPageReveal enabled={enabled}>
      <p>{content}</p>
    </ExperimentalPageReveal>
  );
}

describe("ExperimentalPageReveal", () => {
  it("leaves the page alone when the player has not opted in", () => {
    pathname = "/dashboard";
    renderPage(false);
    expect(screen.queryByTestId("ascii-reveal")).toBeNull();
    expect(screen.getByText("Page content")).toBeTruthy();
  });

  it("wraps the page in the decode when the player has opted in", () => {
    pathname = "/dashboard";
    renderPage(true);
    const wrapper = screen.getByTestId("ascii-reveal");
    expect(wrapper.dataset.preset).toBe("decode");
    // Driven by the component after content settles, not by the library's
    // mount path, so the first client render matches the server HTML.
    expect(wrapper.dataset.revealOnMount).toBe("false");
    expect(wrapper.textContent).toContain("Page content");
  });

  it("skips pages without the site chrome", () => {
    pathname = "/login";
    renderPage(true);
    expect(screen.queryByTestId("ascii-reveal")).toBeNull();
  });

  it("skips the lightweight marketing pages", () => {
    pathname = "/about/history";
    renderPage(true);
    expect(screen.queryByTestId("ascii-reveal")).toBeNull();
  });

  it("remounts on a path change so the decode replays inside one section", () => {
    pathname = "/corporation/1";
    const { rerender } = renderPage(true);
    const first = screen.getByTestId("ascii-reveal");

    pathname = "/corporation/2";
    rerender(
      <ExperimentalPageReveal enabled={true}>
        <p>Other corporation</p>
      </ExperimentalPageReveal>
    );
    const second = screen.getByTestId("ascii-reveal");

    expect(second).not.toBe(first);
    expect(second.textContent).toContain("Other corporation");
  });
});
