// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en/nav.json";
import { WatchlistBody } from "./WatchlistBody";
import { resetWatchlistStore } from "../useWatchlist";
import type { WatchlistWidgetData } from "@/lib/sidebarWidgets/data/watchlist";

const auth = vi.hoisted(() => ({ user: {} as Record<string, unknown> }));
vi.mock("@/contexts/AuthDataContext", () => ({
  useOptionalAuthMe: () => ({ user: auth.user, navData: { user: auth.user, hasCharacter: true } }),
  useRefetchNav: () => () => undefined,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

const w = en.nav.widgets.watchlist;

const data: WatchlistWidgetData = {
  rows: [
    {
      kind: "corporation",
      id: "4",
      name: "Acme",
      ticker: "ACM",
      value: 11,
      currencyCode: "USD",
      change: 10,
    },
    {
      kind: "commodity",
      id: "oil",
      name: "Crude Oil",
      ticker: null,
      value: 45,
      currencyCode: null,
      change: -5,
    },
    {
      kind: "corporation",
      id: "77",
      name: null,
      ticker: null,
      value: null,
      currencyCode: null,
      change: null,
    },
  ],
};

function renderBody(body: WatchlistWidgetData = data) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <WatchlistBody data={body} compact={false} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  resetWatchlistStore();
  auth.user = {
    experimentalFeatures: true,
    widgetWatchlist: data.rows.map(({ kind, id }) => ({ kind, id })),
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WatchlistBody", () => {
  it("links each item to its page with its price and change", () => {
    renderBody();
    const acme = screen.getByRole("link", { name: /ACM/ });
    expect(acme.getAttribute("href")).toBe("/corporation/4");
    expect(acme.textContent).toContain("▲10.0%");
    const oil = screen.getByRole("link", { name: /Crude Oil/ });
    expect(oil.getAttribute("href")).toBe("/commodity/oil");
    expect(oil.textContent).toContain("▼5.0%");
    expect(screen.getByText(w.missing)).toBeTruthy();
  });

  it("removes an item at once and saves the rest", () => {
    renderBody();
    fireEvent.click(screen.getByRole("button", { name: "Stop watching Acme" }));
    expect(screen.queryByRole("link", { name: /ACM/ })).toBeNull();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/settings/experimental-features");
    expect(JSON.parse(String(init?.body))).toEqual({
      widgetWatchlist: [
        { kind: "commodity", id: "oil" },
        { kind: "corporation", id: "77" },
      ],
    });
  });

  it("explains how to add items when the list is empty", () => {
    auth.user = { experimentalFeatures: true, widgetWatchlist: [] };
    renderBody({ rows: [] });
    expect(screen.getByText(w.empty)).toBeTruthy();
  });
});
