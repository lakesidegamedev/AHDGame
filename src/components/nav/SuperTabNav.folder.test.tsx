/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SuperTabNav } from "./SuperTabNav";
import {
  ALL_CORP_TABS,
  CORP_LEGACY_TAB_MAP,
  buildCorpNavTabs,
} from "@/components/corporation/CorporationTabGroups";

let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => params,
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/corporation/7",
}));

const tabs = buildCorpNavTabs(ALL_CORP_TABS);

function renderNav(extra: Partial<React.ComponentProps<typeof SuperTabNav>> = {}) {
  return render(
    <SuperTabNav
      tabs={tabs}
      legacyMap={CORP_LEGACY_TAB_MAP}
      defaultSuperId="overview"
      renderContent={(superId, subId) => <p>{`content ${superId}/${subId}`}</p>}
      {...extra}
    />
  );
}

describe("SuperTabNav folder variant", () => {
  beforeEach(() => {
    params = new URLSearchParams();
  });

  it("marks the active tab and resolves legacy links", () => {
    params = new URLSearchParams("tab=credit-rating");
    renderNav({ variant: "folder" });
    expect(screen.getByRole("button", { name: /Finance/ }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(
      screen.getByRole("button", { name: /Credit & Bonds/ }).getAttribute("aria-current")
    ).toBe("page");
    expect(screen.getByText("content finance/credit")).toBeTruthy();
  });

  it("draws the open tab as a folder joined to its panel", () => {
    renderNav({ variant: "folder" });
    const active = screen.getByRole("button", { name: /Overview/ });
    expect(active.getAttribute("data-folder-tab")).toBe("active");
    expect(document.querySelector("[data-folder-panel]")).not.toBeNull();
  });

  it("default variant is unchanged", () => {
    renderNav();
    expect(screen.getByRole("button", { name: /Overview/ }).className).toContain("border-b-2");
    expect(document.querySelector("[data-folder-panel]")).toBeNull();
  });

  it("sticky adds the navbar offset only when requested", () => {
    const plain = renderNav({ variant: "folder" });
    expect(plain.container.querySelector("[data-sticky-tabs]")).toBeNull();
    plain.unmount();
    const sticky = renderNav({ variant: "folder", sticky: true });
    const bar = sticky.container.querySelector<HTMLElement>("[data-sticky-tabs]")!;
    expect(bar.className).toContain("top-[var(--site-navbar-h,0px)]");
    // The stuck bar bleeds to the screen edge on a phone so content does not show beside it.
    expect(bar.className).toContain("-mx-4");
    expect(bar.className).toContain("lg:mx-0");
  });

  it("sticky sub-tabs sit under the measured tab bar, however many rows it wraps to", () => {
    params = new URLSearchParams("tab=finance&sub=financials");
    const { container } = renderNav({ variant: "folder", sticky: true });
    const subRow = container.querySelector<HTMLElement>("[data-sticky-subtabs]")!;
    expect(subRow.className).toContain(
      "top-[calc(var(--site-navbar-h,0px)+var(--corp-tabs-h,3.25rem))]"
    );
  });
});
