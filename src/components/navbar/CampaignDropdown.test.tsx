// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import nav from "../../../messages/en/nav.json";
import { CampaignDropdown } from "./CampaignDropdown";

vi.mock("next/navigation", () => ({ usePathname: () => "/campaign-manager" }));
afterEach(cleanup);

function renderIt() {
  render(
    <NextIntlClientProvider locale="en" messages={nav}>
      <CampaignDropdown />
    </NextIntlClientProvider>
  );
}

describe("CampaignDropdown", () => {
  it("opens a menu with exactly Actions and Campaign Manager", () => {
    renderIt();
    const trigger = screen.getByRole("button", { name: /Campaign/ });
    expect(trigger.getAttribute("data-coach")).toBe("nav-actions");
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    expect(items.map((a) => a.getAttribute("href"))).toEqual(["/actions", "/campaign-manager"]);
    expect(
      screen.getByRole("menuitem", { name: /Campaign Manager/ }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("marks the tab active on either page", () => {
    renderIt();
    expect(screen.getByRole("button", { name: /Campaign/ }).className).toContain("text-foreground");
  });
});
