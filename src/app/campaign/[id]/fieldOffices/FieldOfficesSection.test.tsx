/** @vitest-environment happy-dom */
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FieldOfficeView } from "@/lib/campaigns/fieldOffices/queries";
import { FieldOfficesSection } from "./FieldOfficesSection";

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
        strength: 0.5,
      },
    ],
    selectedRegionId: "OH",
    map: {
      regionId: "OH",
      viewBox: "0 0 10 10",
      regionBasePvi: 3,
      regionLivePvi: 4,
      subdivisions: [
        {
          id: "39049",
          name: "Franklin",
          path: "M0,0L1,1Z",
          electorateShare: 0.2,
          basePvi: 4,
          livePvi: 6,
          officeId: "o1",
        },
      ],
    },
    liveLeanYear: null,
    liveLeanPriorYear: null,
    liveLeanActive: false,
    leanSourceLabel: null,
    ...over,
  };
}

function serve(v: FieldOfficeView) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ fieldOffices: v }) } as Response)
    )
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FieldOfficesSection", () => {
  it("keeps the summary and the office list but draws no county map, pointing at the page's map", async () => {
    serve(view());
    const map = document.createElement("div");
    map.setAttribute("data-testid", "campaign-map");
    const scrollIntoView = vi.fn();
    map.scrollIntoView = scrollIntoView;
    document.body.appendChild(map);
    const { container } = render(
      <FieldOfficesSection campaignId="c1" onChanged={vi.fn()} mapOnPage />
    );
    await waitFor(() => expect(screen.getByText("Offices")).toBeTruthy());
    expect(screen.getByText("1/5")).toBeTruthy();
    expect(screen.getByText("Upkeep per turn")).toBeTruthy();
    expect(screen.getByText("Your offices")).toBeTruthy();
    expect(screen.getByText(/Put staff in a county/)).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText(/presidential map above/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go to the map" }));
    expect(scrollIntoView).toHaveBeenCalled();
    map.remove();
  });

  it("tells a viewer who cannot manage only about the lean view", async () => {
    serve(view({ canManage: false, costs: null, funds: null, actions: null }));
    render(<FieldOfficesSection campaignId="c1" onChanged={vi.fn()} mapOnPage />);
    await waitFor(() => expect(screen.getByText("Offices")).toBeTruthy());
    expect(
      screen.getByText(/Field offices: lean to see where this campaign has offices/)
    ).toBeTruthy();
    expect(screen.queryByText(/opportunity/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Close the/ })).toBeNull();
  });

  it("links out to the race page when the map is not on this page", async () => {
    serve(view());
    render(
      <FieldOfficesSection
        campaignId="c1"
        onChanged={vi.fn()}
        mapHref="/elections/e1?view=campaign&campaign=c1&tab=field"
      />
    );
    const link = await screen.findByRole("link", { name: "Open the map" });
    expect(link.getAttribute("href")).toBe("/elections/e1?view=campaign&campaign=c1&tab=field");
    expect(link.getAttribute("target")).toBe("_top");
  });

  it("still closes an office from the list", async () => {
    serve(view());
    const onChanged = vi.fn();
    render(<FieldOfficesSection campaignId="c1" onChanged={onChanged} mapOnPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Close the Franklin office" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/campaigns/c1/field-offices/o1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("reloads when offices change elsewhere on the page", async () => {
    serve(view());
    const { rerender } = render(
      <FieldOfficesSection campaignId="c1" onChanged={vi.fn()} mapOnPage reloadKey={1} />
    );
    await screen.findByText("Offices");
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    rerender(<FieldOfficesSection campaignId="c1" onChanged={vi.fn()} mapOnPage reloadKey={2} />);
    await waitFor(() =>
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls + 1)
    );
  });

  it("keeps a country without a county map as it was: figures and the state picker, no pointer", async () => {
    serve(
      view({
        map: null,
        regions: [
          { id: "AA", name: "Alpha", officeCount: 1, effectPct: 1 },
          { id: "BB", name: "Beta", officeCount: 0, effectPct: 0 },
        ],
        selectedRegionId: "AA",
      })
    );
    render(<FieldOfficesSection campaignId="c1" onChanged={vi.fn()} />);
    await screen.findByText("Offices");
    expect(screen.getByLabelText("State")).toBeTruthy();
    expect(screen.queryByText(/presidential map/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Go to the map" })).toBeNull();
  });

  it("renders nothing where the country has no field offices", async () => {
    serve(view({ enabled: false }));
    const { container } = render(<FieldOfficesSection campaignId="c1" onChanged={vi.fn()} />);
    await waitFor(() => expect(container.textContent).not.toMatch(/Loading/));
    expect(container.textContent).toBe("");
  });

  it("switches the state from the picker and asks for that state", async () => {
    serve(
      view({
        regions: [
          { id: "OH", name: "Ohio", officeCount: 1, effectPct: 0.8 },
          { id: "PA", name: "Pennsylvania", officeCount: 0, effectPct: 0 },
        ],
      })
    );
    render(<FieldOfficesSection campaignId="c1" onChanged={vi.fn()} mapOnPage />);
    fireEvent.change(await screen.findByLabelText("State"), { target: { value: "PA" } });
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/campaigns/c1/field-offices?region=PA")
    );
  });
});
