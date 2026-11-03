/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { clearMarketJsonCache } from "./useMarketJson";
import { OFFER_VIEW_STORAGE_KEY } from "./useOfferView";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (x: number) => `A${x}`,
    formatPrice: (x: number) => `P${x}`,
    formatListingPrice: (x: number) => `P${x}`,
  }),
}));

import { SupplyDealsPanel } from "./SupplyDealsPanel";

const offer = (id: string, side: "buy" | "sell", volumeCap: number) => ({
  id,
  corporationId: `c-${id}`,
  corporationName: `Corp ${id}`,
  slot: 1,
  own: false,
  side,
  commodity: "oil",
  volumeCap,
  pricePremium: 0.1,
  expiresAtTurn: 99,
});

let calls: string[] = [];
let response: Record<string, unknown> = {};

beforeEach(() => {
  clearMarketJsonCache();
  window.localStorage.clear();
  calls = [];
  response = {
    enabled: true,
    offers: [offer("a", "sell", 50), offer("b", "buy", 10)],
    myCorporations: [],
    currentTurn: 10,
    page: 1,
    hasMore: false,
    total: 2,
    totalAll: 2,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const body = url.startsWith("/api/supply-offers") ? response : { commodities: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const offerCalls = () => calls.filter((u) => u.startsWith("/api/supply-offers"));
const lastQuery = () => new URLSearchParams(offerCalls().at(-1)!.split("?")[1]);

describe("SupplyDealsPanel controls", () => {
  it("filters by side, sorts by amount both ways and remembers the choice", async () => {
    render(<SupplyDealsPanel />);
    await screen.findByText("Corp a");
    expect(lastQuery().get("sort")).toBe("newest");

    response = { ...response, offers: [offer("b", "buy", 10)], total: 1, totalAll: 2 };
    fireEvent.click(screen.getByRole("button", { name: "Seeking (buy)" }));
    await screen.findByText("1 of 2 offers.", { exact: false });
    expect(lastQuery().get("side")).toBe("buy");

    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "volume" } });
    await waitFor(() => expect(lastQuery().get("sort")).toBe("volume"));
    // Largest first is the natural direction, so it is not spelled out in the query.
    expect(lastQuery().get("dir")).toBeNull();
    const order = screen.getByRole("group", { name: "Sort order" });
    expect(within(order).getByRole("button", { name: "Largest first" })).toBeTruthy();
    fireEvent.click(within(order).getByRole("button", { name: "Smallest first" }));
    await waitFor(() => expect(lastQuery().get("dir")).toBe("asc"));

    expect(JSON.parse(window.localStorage.getItem(OFFER_VIEW_STORAGE_KEY)!)).toMatchObject({
      side: "buy",
      sort: "volume",
      dir: "asc",
    });
  });

  it("opens on the saved choice instead of resetting", async () => {
    window.localStorage.setItem(
      OFFER_VIEW_STORAGE_KEY,
      JSON.stringify({ kind: "all", side: "sell", commodity: "", sort: "premium", dir: "desc" })
    );
    render(<SupplyDealsPanel />);
    await screen.findByText("Corp a");
    expect(offerCalls()).toHaveLength(1);
    expect(Object.fromEntries(lastQuery())).toMatchObject({
      kind: "all",
      side: "sell",
      sort: "premium",
      dir: "desc",
    });
    expect(screen.getByRole("button", { name: "Highest first" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("offers the commodity filter and name sort only across commodities", async () => {
    const { unmount } = render(<SupplyDealsPanel />);
    await screen.findByText("Corp a");
    expect(screen.getByLabelText("Commodity")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Commodity name" })).toBeTruthy();
    unmount();

    render(<SupplyDealsPanel commodity="oil" />);
    await screen.findByText("Corp a");
    expect(lastQuery().get("commodity")).toBe("oil");
    expect(screen.queryByLabelText("Commodity")).toBeNull();
    expect(screen.queryByRole("option", { name: "Commodity name" })).toBeNull();
    expect(screen.getByRole("option", { name: "Price" })).toBeTruthy();
  });

  it("explains an empty list the filters caused and offers a way back", async () => {
    response = { ...response, offers: [], total: 0, totalAll: 7 };
    render(<SupplyDealsPanel commodity="oil" />);
    await screen.findByText("No offers match these filters.");
    expect(screen.getByText("0 of 7 offers.", { exact: false })).toBeTruthy();

    response = { ...response, offers: [offer("a", "sell", 50)], total: 7, totalAll: 7 };
    fireEvent.click(screen.getByRole("button", { name: "Show all offers" }));
    await screen.findByText("Corp a");
    expect(lastQuery().get("kind")).toBe("all");
    expect(lastQuery().get("side")).toBeNull();
  });

  it("says plainly when there are no offers at all", async () => {
    response = { ...response, offers: [], total: 0, totalAll: 0 };
    render(<SupplyDealsPanel />);
    await screen.findByText("There are no open offers right now.");
    expect(screen.queryByRole("button", { name: "Show all offers" })).toBeNull();
  });
});
