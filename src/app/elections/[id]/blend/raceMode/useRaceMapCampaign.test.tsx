/** @vitest-environment happy-dom */
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import type { CampaignDesk } from "@/components/campaign/useCampaignDesk";
import type { ElectionDetail } from "../../components/ElectionDetailTypes";
import { RaceModeProvider, type RaceModeSlots } from "./RaceModeContext";
import { useRaceMapCampaign } from "./useRaceMapCampaign";

let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
const fetchJson = vi.fn();
vi.mock("@/lib/observability/fetchJson", () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

const election = (over: Partial<ElectionDetail> = {}) =>
  ({
    id: "e1",
    countryId: "US",
    myCampaignId: null,
    allCandidates: [
      { characterId: "cand1", isYou: false, campaignId: "c1", partyColor: "#111" },
      { characterId: "cand2", isYou: false, campaignId: "c2", partyColor: "#222" },
      { characterId: "cand3", isYou: true, campaignId: "c3", partyColor: "#333" },
    ],
    ...over,
  }) as unknown as ElectionDetail;

function slots(desk: CampaignDesk | null): RaceModeSlots {
  return { switcher: null, campaign: null, desk, mapAbove: desk !== null };
}

function deskFor(
  accessLevel: "owner" | "public",
  canManage = false,
  fieldOfficeScope: "county" | null = "county"
): CampaignDesk {
  return {
    campaignId: "c1",
    campaign: {
      id: "c1",
      electionId: "e1",
      candidateId: "cand1",
      accessLevel,
      electionInfo: { fieldOfficeScope, fieldOfficeCount: 2 },
    },
    loading: false,
    error: "",
    me: {
      funds: 0,
      storedFunds: 0,
      fundsCurrency: null,
      actions: 0,
      nationalInfluence: 0,
      countryId: "US",
      characterId: "me",
    },
    currentTurn: 1,
    wire: [],
    canManage,
    canSurrogate: false,
    stateOps: { view: null, reload: vi.fn() },
    canvassStateId: null,
    refresh: vi.fn(),
    refreshMe: vi.fn(),
  } as unknown as CampaignDesk;
}

function wrap(value: RaceModeSlots | null) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <RaceModeProvider value={value as RaceModeSlots}>{children}</RaceModeProvider>;
  }
  return Wrapper;
}

beforeEach(() => {
  search = "";
  fetchJson.mockReset();
  fetchJson.mockResolvedValue({
    canBuild: true,
    states: [],
    racePresence: [{ characterId: "cand1", levelsByState: { OH: 3 } }],
  });
});

describe("useRaceMapCampaign", () => {
  it("shows a manager of another ticket that ticket's presence in Race mode", async () => {
    const { result } = renderHook(() => useRaceMapCampaign(election({ myCampaignId: "c1" })), {
      wrapper: wrap(slots(null)),
    });
    await waitFor(() => expect(result.current.presence?.levels).toEqual({ OH: 3 }));
    expect(result.current.presence?.color).toBe("#111");
    render(<>{result.current.panelExtra?.("OH")}</>);
    expect(screen.getByText("Your campaign here")).toBeTruthy();
    // Presence is the candidate's to build.
    expect(screen.queryByRole("button", { name: /Build presence/ })).toBeNull();
  });

  it("shows a reader on no campaign nothing in Race mode", () => {
    const { result } = renderHook(
      () => useRaceMapCampaign(election({ allCandidates: [] } as Partial<ElectionDetail>)),
      { wrapper: wrap(slots(null)) }
    );
    expect(result.current.presence).toBeNull();
    expect(result.current.panelExtra).toBeUndefined();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("follows the campaign on screen in Campaign mode for someone on it", async () => {
    // A manager reads the ticket's own list, so the rows come from the campaign-named call.
    fetchJson.mockResolvedValue({
      canBuild: true,
      fxRate: 1,
      states: [{ stateId: "OH", level: 3, nextCost: 100, builtThisTurn: false }],
      racePresence: [],
    });
    const { result } = renderHook(() => useRaceMapCampaign(election()), {
      wrapper: wrap(slots(deskFor("owner", true))),
    });
    await waitFor(() => expect(result.current.presence?.levels).toEqual({ OH: 3 }));
    expect(result.current.inPage).toBe(true);
    render(<>{result.current.panelExtra?.("OH")}</>);
    expect(screen.getByText("Your campaign here")).toBeTruthy();
  });

  it("offers a manager the build button for the ticket, naming the campaign", async () => {
    fetchJson.mockResolvedValue({
      canBuild: true,
      fxRate: 1,
      states: [{ stateId: "OH", level: 3, nextCost: 100, builtThisTurn: false }],
      racePresence: [],
    });
    const { result } = renderHook(() => useRaceMapCampaign(election()), {
      wrapper: wrap(slots(deskFor("owner", true))),
    });
    await waitFor(() => expect(result.current.presence?.levels).toEqual({ OH: 3 }));
    expect(fetchJson.mock.calls[0][0]).toBe(
      "/api/political-operations/state-org/list?campaignId=c1"
    );
    render(<>{result.current.panelExtra?.("OH")}</>);
    expect(screen.getByRole("button", { name: /Build presence to level 4/ })).toBeTruthy();
  });

  it("offers the running mate the ticket's level and no build button", async () => {
    // Owner-level view without manage access: the running mate.
    const { result } = renderHook(() => useRaceMapCampaign(election()), {
      wrapper: wrap(slots(deskFor("owner", false))),
    });
    await waitFor(() => expect(result.current.presence?.levels).toEqual({ OH: 3 }));
    expect(fetchJson.mock.calls[0][0]).toBe("/api/political-operations/state-org/list");
    render(<>{result.current.panelExtra?.("OH")}</>);
    expect(screen.getByText("Your campaign here")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Build presence/ })).toBeNull();
  });

  it("offers the candidate their own build button without naming a campaign", async () => {
    fetchJson.mockResolvedValue({
      canBuild: true,
      fxRate: 1,
      states: [{ stateId: "OH", level: 3, nextCost: 100, builtThisTurn: false }],
      racePresence: [],
    });
    const { result } = renderHook(() => useRaceMapCampaign(election({ myCampaignId: "c3" })), {
      wrapper: wrap(slots(null)),
    });
    await waitFor(() => expect(result.current.presence?.levels).toEqual({ OH: 3 }));
    expect(fetchJson.mock.calls[0][0]).toBe("/api/political-operations/state-org/list");
    render(<>{result.current.panelExtra?.("OH")}</>);
    expect(screen.getByRole("button", { name: /Build presence to level 4/ })).toBeTruthy();
  });

  it("adds no presence layer or actions when the campaign on screen is a rival's", () => {
    // The viewer is a candidate elsewhere in the race; that must not leak in here.
    const { result } = renderHook(() => useRaceMapCampaign(election({ myCampaignId: "c3" })), {
      wrapper: wrap(slots(deskFor("public"))),
    });
    expect(result.current.presence).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
    const { container } = render(<>{result.current.panelExtra?.("OH")}</>);
    expect(container.textContent).toBe("");
  });

  it("does nothing outside the US map", () => {
    const { result } = renderHook(
      () => useRaceMapCampaign(election({ countryId: "FR", myCampaignId: "c1" })),
      { wrapper: wrap(slots(null)) }
    );
    expect(result.current.presence).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  describe("field offices on the map", () => {
    it("hands the campaign on screen to the map in Campaign mode, rival's included", () => {
      const { result } = renderHook(() => useRaceMapCampaign(election()), {
        wrapper: wrap(slots(deskFor("public"))),
      });
      expect(result.current.fieldOffices).toMatchObject({
        campaignId: "c1",
        version: 2,
        startInFieldView: false,
      });
    });

    it("refreshes the desk when an office opens or closes", () => {
      const desk = deskFor("owner", true);
      const { result } = renderHook(() => useRaceMapCampaign(election()), {
        wrapper: wrap(slots(desk)),
      });
      result.current.fieldOffices?.onChanged();
      expect(desk.refresh).toHaveBeenCalled();
      expect(desk.refreshMe).toHaveBeenCalled();
    });

    it("opens in the field-office view from the old field tab link", () => {
      search = "tab=field&region=OH";
      const { result } = renderHook(() => useRaceMapCampaign(election()), {
        wrapper: wrap(slots(deskFor("owner", true))),
      });
      expect(result.current.fieldOffices?.startInFieldView).toBe(true);
    });

    it("offers none in Race mode, outside the US, or where the country has no offices", () => {
      const race = renderHook(() => useRaceMapCampaign(election()), {
        wrapper: wrap(slots(null)),
      });
      expect(race.result.current.fieldOffices).toBeNull();
      const none = renderHook(() => useRaceMapCampaign(election()), {
        wrapper: wrap(slots(deskFor("owner", true, null))),
      });
      expect(none.result.current.fieldOffices).toBeNull();
      const fr = renderHook(() => useRaceMapCampaign(election({ countryId: "FR" })), {
        wrapper: wrap(slots(deskFor("owner", true))),
      });
      expect(fr.result.current.fieldOffices).toBeNull();
    });
  });
});
