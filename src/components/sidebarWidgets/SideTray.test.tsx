// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en/nav.json";
import { SideTray, type SideTrayProps } from "./SideTray";
import { resetSidebarWidgetCache } from "./useSidebarWidgetData";

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="keir-panel" />,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/askDrawer/KeirSprite", () => ({ KeirSprite: () => null }));

const w = en.nav.widgets;

function renderTray(overrides: Partial<SideTrayProps> = {}) {
  const props: SideTrayProps = {
    side: "right",
    onSwapSide: vi.fn(),
    keirHidden: false,
    layout: { tray: ["staffQueues"], nav: {} },
    options: [
      { key: "staffQueues", label: "Staff review queues" },
      { key: "stockTicker:global", label: "Global market" },
    ],
    menus: ["world", "staff"],
    resolveKey: (key) => key,
    initialOpen: false,
    onSaveLayout: vi.fn(),
    onSaveOpen: vi.fn(),
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SideTray {...props} />
    </NextIntlClientProvider>
  );
  return props;
}

beforeEach(() => {
  resetSidebarWidgetCache();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { staffQueues: { admin: true, wikiReview: 2, altClusters: 1, playerReports: 0 } },
        })
      )
    )
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.sideTray;
});

describe("SideTray", () => {
  it("shows a badge for waiting staff work on the closed rail and makes room for it", async () => {
    renderTray();
    const open = screen.getByRole("button", { name: w.tray.openTray });
    await waitFor(() => expect(open.textContent).toContain("3"));
    expect(document.documentElement.dataset.sideTray).toBe("right");
    expect(document.documentElement.style.getPropertyValue("--side-tray-push")).toBe("48px");
  });

  it("opens to the widgets, links each queue, and remembers it was opened", async () => {
    const props = renderTray();
    fireEvent.click(screen.getByRole("button", { name: w.tray.openTray }));
    expect(props.onSaveOpen).toHaveBeenCalledWith(true);
    const wiki = await screen.findByRole("link", { name: new RegExp(w.staffQueues.wikiReview) });
    expect(wiki.getAttribute("href")).toBe("/admin?tab=content&sub=wiki-review");
    // Wide screens push the page over by the open panel.
    expect(document.documentElement.style.getPropertyValue("--side-tray-push")).toBe("380px");
  });

  it("holds Ask Keir as a tab, and leaves it out when Keir is hidden", () => {
    renderTray({ initialOpen: true });
    fireEvent.click(screen.getByRole("tab", { name: w.tray.keir }));
    expect(screen.getByTestId("keir-panel")).toBeTruthy();
    cleanup();
    renderTray({ initialOpen: true, keirHidden: true });
    expect(screen.queryByRole("tab", { name: w.tray.keir })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Ask Keir" })).toBeNull();
  });

  it("adds, removes and places widgets through the editor", () => {
    const props = renderTray({ initialOpen: true });
    fireEvent.click(screen.getByRole("button", { name: w.tray.edit }));
    fireEvent.click(screen.getByRole("button", { name: "+ Global market" }));
    expect(props.onSaveLayout).toHaveBeenLastCalledWith({
      tray: ["staffQueues", "stockTicker:global"],
      nav: {},
    });
    fireEvent.click(screen.getByRole("button", { name: `${w.tray.remove}: Staff review queues` }));
    expect(props.onSaveLayout).toHaveBeenLastCalledWith({ tray: [], nav: {} });
    fireEvent.change(screen.getByRole("combobox", { name: w.menus.world }), {
      target: { value: "stockTicker:global" },
    });
    expect(props.onSaveLayout).toHaveBeenLastCalledWith({
      tray: ["staffQueues"],
      nav: { world: "stockTicker:global" },
    });
  });
});
