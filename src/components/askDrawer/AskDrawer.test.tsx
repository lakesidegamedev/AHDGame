// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const auth = { user: null as null | Record<string, unknown> };
let pathname = "/corporation/1";
vi.mock("@/contexts/AuthDataContext", () => ({
  useOptionalAuthMe: () => ({ user: auth.user, loading: false }),
  useRefetchNav: () => () => undefined,
}));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { AskDrawer, keyboardInset } from "./AskDrawer";

describe("AskDrawer", () => {
  beforeEach(() => {
    auth.user = null;
    pathname = "/corporation/1";
  });

  const edgeTab = () =>
    screen.getAllByRole("button", { name: "Open Ask Keir" }).find((b) => !b.dataset.askFab)!;

  it("stays hidden for signed-out visitors", () => {
    const { container } = render(<AskDrawer />);
    expect(container.innerHTML).toBe("");
  });

  it("shows for every signed-in player, experimental features or not", () => {
    auth.user = { experimentalFeatures: false };
    render(<AskDrawer />);
    expect(screen.getAllByRole("button", { name: "Open Ask Keir" })).toHaveLength(2);
  });

  it("stays hidden on pages without the site chrome", () => {
    auth.user = {};
    pathname = "/login";
    const { container } = render(<AskDrawer />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the tab on the chosen side", () => {
    auth.user = { askDrawerSide: "left" };
    render(<AskDrawer />);
    expect(edgeTab().className).toContain("left-0");
  });

  it("defaults to the right edge", () => {
    auth.user = {};
    render(<AskDrawer />);
    expect(edgeTab().className).toContain("right-0");
  });

  it("gives phones a floating Keir button and desktops the edge tab", () => {
    auth.user = {};
    render(<AskDrawer />);
    const fab = document.querySelector("[data-ask-fab]") as HTMLElement;
    expect(fab.className).toContain("sm:hidden");
    expect(fab.className).toContain("h-11");
    expect(fab.className).toContain("var(--status-bar-height,0px)");
    expect(edgeTab().className).toContain("hidden");
    expect(edgeTab().className).toContain("sm:flex");
  });

  it("opens full width on phones and capped on wider screens", () => {
    auth.user = {};
    render(<AskDrawer />);
    fireEvent.click(document.querySelector("[data-ask-fab]") as HTMLElement);
    const aside = document.querySelector("aside[aria-label='Ask']") as HTMLElement;
    expect(aside.className).toContain("w-full");
    expect(aside.className).toContain("sm:max-w-[420px]");
    expect(aside.getAttribute("aria-hidden")).toBe("false");
  });

  it("opens below the top nav and runs to the bottom of the viewport", () => {
    auth.user = {};
    const nav = document.createElement("nav");
    nav.setAttribute("data-site-navbar", "");
    // Mid slide-in the nav's on-screen box is above the viewport; its layout height is not.
    nav.getBoundingClientRect = () => ({ top: -61, bottom: 0, height: 61 }) as DOMRect;
    Object.defineProperty(nav, "offsetHeight", { value: 61 });
    document.body.appendChild(nav);
    try {
      render(<AskDrawer />);
      fireEvent.click(edgeTab());
      const aside = document.querySelector("aside[aria-label='Ask']") as HTMLElement;
      expect(aside.style.top).toBe("61px");
      expect(aside.style.bottom).toBe("0px");
    } finally {
      nav.remove();
    }
  });
});

describe("keyboardInset", () => {
  it("is the part of the layout viewport the on-screen keyboard covers", () => {
    expect(keyboardInset(800, { height: 500, offsetTop: 0 })).toBe(300);
    expect(keyboardInset(800, { height: 500, offsetTop: 40 })).toBe(260);
  });

  it("is zero with no keyboard or no visual viewport", () => {
    expect(keyboardInset(800, { height: 800, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(800, null)).toBe(0);
  });
});
