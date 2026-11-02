// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { buildRaceIndex, type RaceFilter } from "@/lib/campaignManager/rules";
import { election } from "@/lib/campaignManager/rules/__fixtures__/election";
import type { CampaignGeo } from "./geoSource";

const geo: CampaignGeo = {
  w: 100,
  h: 100,
  unitSource: "static",
  unitOffsetY: 0,
  regions: {
    LON: { n: "London", d: "M0,0H10V10Z", bb: [0, 0, 10, 10], nb: ["SEE"] },
    SEE: { n: "South East", d: "M11,0H20V10Z", bb: [11, 0, 20, 10], nb: ["LON"] },
  },
  units: {
    LON: [
      { id: "u1", n: "Battersea", d: "M0,0H5V5Z" },
      { id: "u2", n: "Barking", d: "M5,5H10V10Z" },
    ],
    SEE: [{ id: "u3", n: "Dover", d: "M11,0H20V10Z" }],
  },
};
let geoResult: CampaignGeo | null = geo;
vi.mock("./geoSource", async (orig) => ({
  ...(await orig<typeof import("./geoSource")>()),
  loadCampaignGeo: vi.fn(async () => geoResult),
}));

import { CampaignMap } from "./CampaignMap";

const ctx = { currentTurn: 10, nationalChamberKeys: ["commons"] };
const races = buildRaceIndex(
  [
    election({
      id: "lon",
      electionType: "commons",
      state: "LON",
      countryId: "UK",
      cands: [
        { id: "a", name: "Labour", party: "1", share: 60, isYou: true },
        { id: "b", name: "Conservative", party: "2", share: 40 },
      ],
    }),
    election({
      id: "see",
      electionType: "commons",
      state: "SEE",
      countryId: "UK",
      cands: [
        { id: "c", name: "Con", party: "2", share: 55 },
        { id: "d", name: "Lab", party: "1", share: 45 },
      ],
    }),
  ],
  ctx
);

const results = {
  viewBox: "0 0 1 1",
  unitLabel: "Constituency",
  unitLabelPlural: "Constituencies",
  subdivisions: [
    {
      id: "u1",
      name: "Battersea",
      path: "",
      votes: { a: 70, b: 30 },
      margin: 40,
      winner: "a",
      baselineLeader: "P1",
    },
    {
      id: "u2",
      name: "Barking",
      path: "",
      votes: { a: 55, b: 45 },
      margin: 10,
      winner: "a",
      baselineLeader: "P2",
    },
  ],
  candidateNames: { a: "Labour", b: "Conservative" },
  candidateParties: { a: "1", b: "2" },
  partyColors: { "1": "#dc2626", "2": "#2563eb" },
};

beforeEach(() => {
  geoResult = geo;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/lon/state/LON/")
        ? new Response(JSON.stringify(results))
        : new Response("{}", { status: 404 })
    )
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderMap(filter: Partial<RaceFilter> = {}, selectedKey: string | null = null) {
  const onSelectRegion = vi.fn();
  const onCanvass = vi.fn();
  const f: RaceFilter = {
    type: "commons",
    stage: "all",
    regionId: "ALL",
    query: "",
    regionNames: { LON: "London", SEE: "South East" },
    ...filter,
  };
  renderWithElectionsMessages(
    <CampaignMap
      countryId="UK"
      countryName="United Kingdom"
      regionNoun="Region"
      races={races}
      filter={f}
      selectedRace={races.find((r) => r.key === selectedKey) ?? null}
      onSelectRegion={onSelectRegion}
      onCanvass={onCanvass}
    />
  );
  return { onSelectRegion, onCanvass };
}

describe("CampaignMap", () => {
  it("shades each region by its race and zooms on click", async () => {
    const { onSelectRegion } = renderMap();
    const london = await screen.findByRole("button", { name: /London/ });
    expect(london.getAttribute("fill")).toMatch(/^rgb\(/);
    fireEvent.click(london);
    expect(onSelectRegion).toHaveBeenCalledWith("LON");
  });

  it("loads the selected race's sub-units and opens a call card", async () => {
    renderMap({ regionId: "LON" }, "lon");
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/elections/lon/state/LON/subdivision-results"
      )
    );
    fireEvent.click(await screen.findByRole("button", { name: /Battersea/ }));
    expect(screen.getByText(/^P1 hold · Safe$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Barking/ }));
    expect(screen.getByText(/^P1 gain from P2 · Likely$/)).toBeTruthy();
    expect(screen.getByText("2 Constituencies")).toBeTruthy();
  });

  it("offers canvassing only in the player's own race", async () => {
    const mine = renderMap({ regionId: "LON" }, "lon");
    fireEvent.click(await screen.findByRole("button", { name: /Battersea/ }));
    fireEvent.click(screen.getByRole("button", { name: "Canvass voters here" }));
    expect(mine.onCanvass).toHaveBeenCalled();
    cleanup();
    renderMap({ regionId: "SEE" }, "see");
    await screen.findByRole("button", { name: /Dover/ });
    fireEvent.click(screen.getByRole("button", { name: /Dover/ }));
    expect(screen.queryByRole("button", { name: "Canvass voters here" })).toBeNull();
  });

  it("returns to the national map from the breadcrumb", async () => {
    const { onSelectRegion } = renderMap({ regionId: "LON" }, "lon");
    fireEvent.click(await screen.findByRole("button", { name: "United Kingdom" }));
    expect(onSelectRegion).toHaveBeenCalledWith("ALL");
  });

  it("says so when the map cannot load", async () => {
    geoResult = null;
    renderMap();
    expect(await screen.findByText("No map for this country yet.")).toBeTruthy();
  });
});

describe("CampaignMap with shapes served apart from results (US)", () => {
  it("draws a region's counties before its race has any results", async () => {
    geoResult = {
      w: 100,
      h: 100,
      unitSource: "results",
      unitOffsetY: 0,
      regions: { SEE: { n: "SEE", d: "M0,0H10V10Z", bb: [0, 0, 10, 10], nb: [] } },
      units: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/maps/subdivisions")
          ? new Response(
              JSON.stringify({
                viewBox: "0 0 1 1",
                unitLabel: "County",
                unitLabelPlural: "Counties",
                subdivisions: [
                  { id: "c1", name: "Aurora", path: "M0,0H5V5Z" },
                  { id: "c2", name: "Beadle", path: "M5,5H9V9Z" },
                ],
              })
            )
          : new Response("{}", { status: 404 })
      )
    );
    // A race no other test has loaded results for: the results cache is module-wide.
    renderMap({ regionId: "SEE" }, "see");
    fireEvent.click(await screen.findByRole("button", { name: "Aurora" }));
    expect(screen.getByText("No results for this area yet.")).toBeTruthy();
    expect(screen.getByText("2 Counties")).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/maps/subdivisions?country=UK&type=commons&region=SEE",
      expect.anything()
    );
  });
});
