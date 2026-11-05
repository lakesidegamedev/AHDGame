/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FieldOfficeView } from "@/lib/campaigns/fieldOffices/queries";
import { PresidentialMap } from "./PresidentialMap";
import type { PresMapModel, PresMapState } from "./presMapModel";

vi.mock("./usStatesGeo", async (orig) => ({
  ...(await orig<typeof import("./usStatesGeo")>()),
  loadUsStateGeo: () =>
    Promise.resolve([
      {
        id: "OH",
        d: "M400,200L460,200L460,260L400,260Z",
        centroid: [430, 230],
        width: 60,
        height: 60,
        x0: 400,
        y0: 200,
      },
    ]),
}));

const state = {
  id: "OH",
  name: "Ohio",
  ev: 17,
  leaderId: "a",
  leaderName: "A",
  leaderColor: "#2563eb",
  margin: 3,
  tier: "lean",
  fill: "#2563eb",
  ink: "#fff",
  shares: [],
  totalVotes: 0,
  trend: {
    status: "none",
    candidateId: null,
    name: null,
    color: null,
    shiftPp: 0,
    windowTurns: 3,
    series: [],
  },
  sinceTurn: null,
  turnsAgo: null,
} as unknown as PresMapState;

const model: PresMapModel = {
  states: { OH: state },
  candidates: {},
  legendCandidates: [],
};

const sub = (
  id: string,
  name: string,
  marginalPct: number | undefined,
  officeId: string | null
) => ({
  id,
  name,
  path: id === "39035" ? "M410,210L420,210L420,220Z" : "M430,230L440,230L440,240Z",
  electorateShare: 0.2,
  basePvi: 4,
  livePvi: 6,
  marginalPct,
  officeId,
});

function view(over: Partial<FieldOfficeView> = {}): FieldOfficeView {
  return {
    enabled: true,
    scope: "county",
    canManage: true,
    raceActive: true,
    currentTurn: 10,
    rampTurns: 4,
    cap: 5,
    costs: { open: 1000, upkeep: 50, actions: 2, currency: "USD" },
    funds: 5000,
    actions: 6,
    regions: [{ id: "OH", name: "Ohio", officeCount: 1, effectPct: 0.8 }],
    offices: [
      {
        id: "o1",
        regionId: "OH",
        subdivisionId: "39049",
        label: "Franklin",
        openedTurn: 8,
        strength: 1,
      },
    ],
    selectedRegionId: "OH",
    map: {
      regionId: "OH",
      viewBox: "0 0 960 600",
      regionBasePvi: 3,
      regionLivePvi: 4,
      subdivisions: [sub("39035", "Cuyahoga", 0.9, null), sub("39049", "Franklin", 0.4, "o1")],
    },
    liveLeanYear: null,
    liveLeanPriorYear: null,
    liveLeanActive: false,
    leanSourceLabel: "2020 results",
    ...over,
  };
}

function serve(v: FieldOfficeView) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(init?.method === "POST" ? { success: true } : { fieldOffices: v }),
      } as Response)
    )
  );
}

function mount(
  config: Parameters<typeof PresidentialMap>[0]["fieldOffices"],
  desktop = true,
  inPage = false
) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: desktop,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList
  );
  return render(
    <PresidentialMap
      variant="stage"
      model={model}
      electionId="e1"
      countryId="US"
      turn={10}
      fieldOffices={config}
      inPage={inPage}
      renderPanel={() => <div>overview</div>}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const config = { campaignId: "c1", onChanged: vi.fn() };

describe("PresidentialMap field offices", () => {
  it("offers no field-office views without a campaign", async () => {
    serve(view());
    mount(null);
    await waitFor(() => expect(document.querySelector("[data-state=OH]")).not.toBeNull());
    expect(screen.queryByRole("radio", { name: /Field offices/ })).toBeNull();
  });

  it("offers lean and opportunity to a manager", async () => {
    serve(view());
    mount(config);
    expect(await screen.findByRole("radio", { name: "Field offices: lean" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Field offices: opportunity" })).toBeTruthy();
  });

  it("offers only lean to a viewer who cannot manage offices", async () => {
    serve(view({ canManage: false, costs: null, funds: null, actions: null }));
    mount(config);
    expect(await screen.findByRole("radio", { name: "Field offices: lean" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Field offices: opportunity" })).toBeNull();
  });

  it("offers nothing where the country has no field offices", async () => {
    serve(view({ enabled: false, regions: [], offices: [], map: null }));
    mount(config);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("radio", { name: /Field offices/ })).toBeNull();
  });

  it("shows a state's counties with a pin on the held one, and opens a county's detail on click", async () => {
    serve(view());
    mount(config);
    fireEvent.click(await screen.findByRole("radio", { name: "Field offices: opportunity" }));
    await waitFor(() => expect(document.querySelector("[data-state=OH]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-state=OH]")!);

    await waitFor(() => expect(document.querySelectorAll("path[data-county]").length).toBe(2));
    expect(screen.getAllByTestId("field-office-pin")).toHaveLength(1);
    expect(screen.getByText("Field offices in Ohio")).toBeTruthy();

    fireEvent.click(document.querySelector("path[data-county='39035']")!);
    const detail = await screen.findByTestId("field-office-county");
    expect(detail.textContent).toMatch(/Cuyahoga County/);
    expect(detail.textContent).toMatch(/Share of state/);
    expect(screen.getByRole("button", { name: /Open office/ })).toBeTruthy();
  });

  it("opens an office from the county detail and tells the page", async () => {
    serve(view());
    const onChanged = vi.fn();
    mount({ campaignId: "c1", onChanged });
    fireEvent.click(await screen.findByRole("radio", { name: "Field offices: lean" }));
    await waitFor(() => expect(document.querySelector("[data-state=OH]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-state=OH]")!);
    await waitFor(() => expect(document.querySelectorAll("path[data-county]").length).toBe(2));
    fireEvent.click(document.querySelector("path[data-county='39035']")!);
    fireEvent.click(await screen.findByRole("button", { name: /Open office/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/campaigns/c1/field-offices",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ regionId: "OH", subdivisionId: "39035" }),
      })
    );
  });

  it("starts in the field-office view for the old field tab link", async () => {
    serve(view());
    mount({ ...config, startInFieldView: true });
    const lean = await screen.findByRole("radio", { name: "Field offices: lean" });
    expect(lean.getAttribute("aria-checked")).toBe("true");
  });

  it("unlocks a locked in-page map when a field-office colouring is chosen with a state open", async () => {
    serve(view());
    mount(config, true, true);
    await waitFor(() => expect(document.querySelector("[data-state=OH]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-state=OH]")!);
    expect(document.querySelector("[data-locked]")?.getAttribute("data-locked")).toBe("true");

    fireEvent.click(await screen.findByRole("radio", { name: "Field offices: lean" }));
    expect(document.querySelector("[data-locked]")?.getAttribute("data-locked")).toBe("false");
  });

  it("leaves a locked in-page map alone when no state is open", async () => {
    serve(view());
    mount(config, true, true);
    fireEvent.click(await screen.findByRole("radio", { name: "Field offices: lean" }));
    expect(document.querySelector("[data-locked]")?.getAttribute("data-locked")).toBe("true");
  });

  it("lists the best counties instead of the map on a phone", async () => {
    serve(view());
    mount(config, false);
    await waitFor(() => expect(document.querySelector("[data-state=OH]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-state=OH]")!);
    fireEvent.click(await screen.findByRole("button", { name: "Field offices in Ohio" }));
    const top = await screen.findByTestId("field-office-top");
    expect(top.textContent).toMatch(/Cuyahoga/);
    expect(top.textContent).not.toMatch(/Franklin/);
  });
});
