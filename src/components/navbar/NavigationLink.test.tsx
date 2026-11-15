// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import NavigationLink from "./NavigationLink";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-next-link="true">
      {children}
    </a>
  ),
}));
afterEach(cleanup);

describe("NavigationLink", () => {
  it("uses browser navigation so the current-company lookup cannot be prefetched or router-cached", () => {
    render(
      <NavigationLink href="/api/corporations/mine" prefetch replace scroll={false}>
        My Corporation
      </NavigationLink>
    );
    const link = screen.getByRole("link", { name: "My Corporation" });
    expect(link.getAttribute("href")).toBe("/api/corporations/mine");
    expect(link.hasAttribute("data-next-link")).toBe(false);
    expect(link.hasAttribute("prefetch")).toBe(false);
    expect(link.hasAttribute("replace")).toBe(false);
    expect(link.hasAttribute("scroll")).toBe(false);
  });

  it("preserves Next navigation for ordinary destinations", () => {
    render(<NavigationLink href="/market">Market</NavigationLink>);
    expect(screen.getByRole("link").getAttribute("data-next-link")).toBe("true");
  });
});
