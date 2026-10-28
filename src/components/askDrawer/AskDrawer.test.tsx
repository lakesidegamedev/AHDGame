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

import { AskDrawer } from "./AskDrawer";

describe("AskDrawer", () => {
  beforeEach(() => {
    auth.user = null;
    pathname = "/corporation/1";
  });

  it("stays hidden unless the player opted in", () => {
    auth.user = { experimentalFeatures: false };
    const { container } = render(<AskDrawer />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the tab on the chosen side for opted-in players", () => {
    auth.user = { experimentalFeatures: true, askDrawerSide: "left" };
    render(<AskDrawer />);
    const tab = screen.getByRole("button", { name: "Open Ask" });
    expect(tab.className).toContain("left-0");
  });

  it("defaults to the right edge", () => {
    auth.user = { experimentalFeatures: true };
    render(<AskDrawer />);
    expect(screen.getByRole("button", { name: "Open Ask" }).className).toContain("right-0");
  });

  it("opens below the top nav and runs to the bottom of the viewport", () => {
    auth.user = { experimentalFeatures: true };
    const nav = document.createElement("nav");
    nav.setAttribute("data-site-navbar", "");
    // Mid slide-in the nav's on-screen box is above the viewport; its layout height is not.
    nav.getBoundingClientRect = () => ({ top: -61, bottom: 0, height: 61 }) as DOMRect;
    Object.defineProperty(nav, "offsetHeight", { value: 61 });
    document.body.appendChild(nav);
    try {
      render(<AskDrawer />);
      fireEvent.click(screen.getByRole("button", { name: "Open Ask" }));
      const aside = document.querySelector("aside[aria-label='Ask']") as HTMLElement;
      expect(aside.style.top).toBe("61px");
      expect(aside.style.bottom).toBe("0px");
    } finally {
      nav.remove();
    }
  });
});
