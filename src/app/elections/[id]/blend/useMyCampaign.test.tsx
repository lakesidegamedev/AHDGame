/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MyCampaignStateBlock, useMyCampaign } from "./useMyCampaign";
import { FieldOfficeMapProvider } from "./presMap/fieldOfficeMapContext";

const fetchJson = vi.fn();
vi.mock("@/lib/observability/fetchJson", () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

const listBody = {
  canBuild: true,
  fxRate: 1,
  // The list's own rows belong to the reader's character, not the ticket.
  states: [{ stateId: "OH", level: 0, nextCost: 100 }],
  racePresence: [
    { characterId: "cand1", levelsByState: { OH: 4, PA: 2 } },
    { characterId: "other", levelsByState: { OH: 9 } },
  ],
};

const race = { id: "e1", countryId: "US" };

beforeEach(() => {
  fetchJson.mockReset();
  fetchJson.mockResolvedValue(listBody);
});

describe("useMyCampaign", () => {
  it("gives the candidate their own levels and the build action", async () => {
    const { result } = renderHook(() =>
      useMyCampaign({
        enabled: true,
        campaignId: "c1",
        race,
        color: "#111",
        candidateId: "cand1",
        viewerIsCandidate: true,
      })
    );
    await waitFor(() => expect(result.current?.canBuild).toBe(true));
    expect(result.current?.levels).toEqual({ OH: 0 });
  });

  it("gives a manager or running mate the ticket's levels and no build action", async () => {
    const { result } = renderHook(() =>
      useMyCampaign({
        enabled: true,
        campaignId: "c1",
        race,
        color: "#111",
        candidateId: "cand1",
        viewerIsCandidate: false,
        canOpenFieldOffice: false,
      })
    );
    await waitFor(() => expect(result.current?.levels).toEqual({ OH: 4, PA: 2 }));
    expect(result.current?.canBuild).toBe(false);
    expect(result.current?.canOpenFieldOffice).toBe(false);
  });

  it("does not fetch for a reader who is not on a campaign here", () => {
    const { result } = renderHook(() =>
      useMyCampaign({ enabled: false, campaignId: null, race, color: "#111" })
    );
    expect(result.current).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe("MyCampaignStateBlock", () => {
  const base = {
    campaignId: "c1",
    race,
    color: "#111",
    levels: { OH: 4 },
    rows: { OH: { stateId: "OH", level: 4, nextCost: 100 } },
    canBuild: false,
    canOpenFieldOffice: true,
    busy: null,
    error: null,
    build: vi.fn(),
  };

  it("shows the level and the field office link, without a build button, to a non-builder", () => {
    render(<MyCampaignStateBlock mine={base} stateId="OH" />);
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Build presence/ })).toBeNull();
    expect(screen.getByText("Open a field office in this state")).toBeTruthy();
  });

  it("hides the field office link from someone who cannot open one", () => {
    render(<MyCampaignStateBlock mine={{ ...base, canOpenFieldOffice: false }} stateId="OH" />);
    expect(screen.queryByText("Open a field office in this state")).toBeNull();
  });

  it("links to the campaign's field tab when there is no map to fly into", () => {
    render(<MyCampaignStateBlock mine={base} stateId="OH" />);
    const link = screen.getByText("Open a field office in this state").closest("a");
    expect(link?.getAttribute("href")).toContain("tab=field");
    expect(link?.getAttribute("href")).toContain("region=OH");
  });

  it("flies the map into the state's counties instead of leaving the page", () => {
    const showFieldOffices = vi.fn();
    render(
      <FieldOfficeMapProvider value={{ showFieldOffices, canZoom: true }}>
        <MyCampaignStateBlock mine={base} stateId="OH" />
      </FieldOfficeMapProvider>
    );
    const control = screen.getByRole("button", { name: "Open a field office in this state" });
    expect(control.closest("a")).toBeNull();
    fireEvent.click(control);
    expect(showFieldOffices).toHaveBeenCalledWith("OH");
  });

  it("leaves the field office link out on a phone, where the overview lists the counties", () => {
    render(
      <FieldOfficeMapProvider value={{ showFieldOffices: vi.fn(), canZoom: false }}>
        <MyCampaignStateBlock mine={base} stateId="OH" />
      </FieldOfficeMapProvider>
    );
    expect(screen.queryByText("Open a field office in this state")).toBeNull();
  });
});
