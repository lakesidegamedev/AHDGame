/**
 * @vitest-environment happy-dom
 */
import {
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/corporations.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExpandMarketModal from "./ExpandMarketModal";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporations";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

function render(view: ReactElement) {
  return renderView(
    <NextIntlClientProvider locale="en" messages={messages}>
      {view}
    </NextIntlClientProvider>
  );
}

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatAmount: (amount: number) => `$${Math.round(amount).toLocaleString("en-US")}`,
  }),
}));

const marketResponse = {
  suggestions: [
    {
      stateId: "CA",
      stateName: "California",
      countryId: "US",
      unownedRevenue: 0,
      splitCost: 0,
      estimatedRevenueCapture: 0,
      canAfford: true,
      ownedSectorId: null,
      competitors: [],
      totalCompetitorRevenue: 0,
      headroomUnits: 543_000,
      starterBuildCostAnchor: 1_100,
      foundingTotalAnchor: 1_600,
      entry: { canEnter: true, reason: null, message: null },
      roomToBuildUnits: 543_000,
      roomScope: "state",
    },
  ],
  availableCountries: ["US"],
  liquidCapital: 25_400,
  liquidCurrencyCode: "USD",
  plantsMode: true,
  starterUnits: 60,
  foundingFeeAnchor: 500,
  foundingBuildTurns: 24,
};

function suggestionReply() {
  return Promise.resolve({
    ok: true,
    json: async () => marketResponse,
  } as Response);
}

describe("ExpandMarketModal plants market finder", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens on ranked new markets and offers every sector type with primary/secondary first", async () => {
    const fetchMock = vi.fn(suggestionReply);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExpandMarketModal
        corpId="corp-1"
        primaryType="agriculture"
        secondaryType="retail"
        liquidCapital={25_400}
        plantsMode
        onClose={() => undefined}
      />
    );

    expect(screen.getByText("Build a new sector")).toBeTruthy();
    expect(screen.queryByText("Back to sector type selection")).toBeNull();

    await screen.findAllByText("California");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("sectorType=agriculture&mode=unowned&ownership=unowned")
    );
    const sectorTypeSelect = screen.getByLabelText("Sector type") as HTMLSelectElement;
    expect(sectorTypeSelect.value).toBe("agriculture");
    // #310 ("allow building in any sector type") made the plants picker list EVERY sector type
    // (primary/secondary badged first, others tagged with their margin penalty), not just the
    // two on-type ones. Query through testing-library (a real array) rather than touching
    // `select.options` — happy-dom's live HTMLCollection proxy throws "Cannot convert a Symbol
    // value to a number" on access under 20.10.2. (#310 left this assertion stale, past a red verify.)
    const optionEls = within(sectorTypeSelect).getAllByRole("option");
    expect(optionEls).toHaveLength(OPERATING_SECTOR_TYPES.length);
    expect(optionEls.map((option) => option.textContent)).toContain("Retail (secondary)");
    expect(screen.getByText("Room to build")).toBeTruthy();
    expect(screen.getByText("543k")).toBeTruthy();
    expect(screen.getAllByText("Can enter now").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Some demand is local to each state. Other demand is shared across reachable markets in the same country, so state estimates can overlap. These estimates are not a sales guarantee."
      )
    ).toBeTruthy();
    expect(screen.getByText(/Room to build: 543k units\/day/)).toBeTruthy();
    expect(screen.queryByText(/units\/day open/)).toBeNull();
    expect(screen.getByText("Best fit")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Sector type"), { target: { value: "retail" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("sectorType=retail"))
    );
  });

  it("reviews the selected market and sends its sector type to founding", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(suggestionReply)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sectorId: "sector-9" }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExpandMarketModal
        corpId="corp-1"
        primaryType="agriculture"
        secondaryType="retail"
        liquidCapital={25_400}
        plantsMode
        onClose={() => undefined}
      />
    );

    await screen.findByText("Best fit");
    fireEvent.click(screen.getByRole("button", { name: "Review farm" }));
    expect(await screen.findByText("Review California")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Build it" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/corporations/corp-1/sectors");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      stateId: "CA",
      sectorType: "agriculture",
    });
    expect(router.push).toHaveBeenCalledWith("/corporation/corp-1/sector/sector-9?build=1");
  });

  // Ticket #1162: a market quoting room for zero is still open to a build, but
  // the list said only "0 farms" and the sentence explaining that was buried in
  // the confirm step, so players read the whole board as closed.
  it("says in the market list that a zero-headroom market is still buildable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            ...marketResponse,
            suggestions: [
              { ...marketResponse.suggestions[0], headroomUnits: 0, roomToBuildUnits: 0 },
            ],
          }),
        } as Response)
      )
    );

    render(
      <ExpandMarketModal
        corpId="corp-1"
        primaryType="agriculture"
        secondaryType="retail"
        liquidCapital={25_400}
        plantsMode
        onClose={() => undefined}
      />
    );

    expect(await screen.findByText(/You can still build here/i)).toBeTruthy();
  });

  it("does not add the still-buildable note when the market has room", async () => {
    vi.stubGlobal("fetch", vi.fn(suggestionReply));

    render(
      <ExpandMarketModal
        corpId="corp-1"
        primaryType="agriculture"
        secondaryType="retail"
        liquidCapital={25_400}
        plantsMode
        onClose={() => undefined}
      />
    );

    await screen.findByText("Best fit");
    expect(screen.queryByText(/You can still build here/i)).toBeNull();
  });
  it("hides the split action and warning for a fully captured market", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ...marketResponse, plantsMode: false }),
      }))
    );
    render(
      <ExpandMarketModal
        corpId="corp-1"
        primaryType="retail"
        initialSectorType="retail"
        liquidCapital={25_400}
        onClose={() => undefined}
      />
    );
    await screen.findByText("California");
    expect(screen.queryByRole("link", { name: "View state economy to split" })).toBeNull();
    expect(screen.queryByText(/You cannot split here currently/)).toBeNull();
  });
  it("shows one country-shared demand estimate while keeping state selection", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          ...marketResponse,
          countrySharedDemand: true,
          countryDemandEstimates: [{ countryId: "US", headroomUnits: 543_000 }],
          suggestions: [
            { ...marketResponse.suggestions[0], headroomUnits: undefined, roomScope: "country" },
            {
              ...marketResponse.suggestions[0],
              stateId: "NY",
              stateName: "New York",
              headroomUnits: undefined,
              roomScope: "country",
              foundingTotalAnchor: 1_800,
            },
          ],
        }),
      } as Response)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExpandMarketModal
        corpId="corp-1"
        primaryType="agriculture"
        liquidCapital={25_400}
        plantsMode
        onClose={() => undefined}
      />
    );

    await screen.findByText("New York");
    expect(screen.getAllByText("543k")).toHaveLength(1);
    expect(screen.getByText(/units\/day, shared across/)).toBeTruthy();
    expect(screen.getByText("shared above")).toBeTruthy();

    const newYorkRow = screen.getAllByRole("button", { name: /New York/ })[0];
    fireEvent.click(newYorkRow);
    expect(newYorkRow.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps per-state estimates for state-scoped or mixed output", async () => {
    vi.stubGlobal("fetch", vi.fn(suggestionReply));

    render(
      <ExpandMarketModal
        corpId="corp-1"
        primaryType="agriculture"
        liquidCapital={25_400}
        plantsMode
        onClose={() => undefined}
      />
    );

    await screen.findByText("543k");
    expect(screen.queryByText(/units\/day, shared across/)).toBeNull();
  });

  it("groups markets by whether they can be entered now and explains the refusal", async () => {
    const pausedMessage =
      "New Retail sectors are paused while consumer demand is rebalanced (40 turns remaining).";
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          ...marketResponse,
          suggestions: [
            marketResponse.suggestions[0],
            {
              ...marketResponse.suggestions[0],
              stateId: "NY",
              stateName: "New York",
              canAfford: true,
              entry: { canEnter: false, reason: "retail_paused", message: pausedMessage },
            },
          ],
        }),
      } as Response)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExpandMarketModal
        corpId="corp-1"
        primaryType="agriculture"
        liquidCapital={25_400}
        plantsMode
        onClose={() => undefined}
      />
    );

    await screen.findByText("New York");
    expect(screen.getAllByText("Can enter now").length).toBeGreaterThan(0);
    expect(screen.getByText("Not available now")).toBeTruthy();
    expect(screen.getByText("Retail paused")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /New York/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Review farm" }));
    await screen.findByText("Review New York");
    const buildButton = screen.getByRole("button", { name: "Build it" }) as HTMLButtonElement;
    expect(buildButton.disabled).toBe(true);
    expect(screen.getAllByText(pausedMessage).length).toBeGreaterThan(0);
    fireEvent.click(buildButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("names a leftover pool as unclaimed legacy revenue, apart from room to build", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            ...marketResponse,
            suggestions: [
              { ...marketResponse.suggestions[0], unownedRevenue: 2_400, roomToBuildUnits: 0 },
            ],
          }),
        } as Response)
      )
    );

    render(
      <ExpandMarketModal
        corpId="corp-1"
        primaryType="agriculture"
        liquidCapital={25_400}
        plantsMode
        onClose={() => undefined}
      />
    );

    await screen.findByText("Best fit");
    expect(screen.getByText(/Room to build: 0 units\/day/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review farm" }));
    expect(await screen.findByText(/Unclaimed legacy revenue here: \$2,400\/day/)).toBeTruthy();
  });
});
