/** @vitest-environment happy-dom */
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import type { CampaignDesk } from "@/components/campaign/useCampaignDesk";
import type { ElectionDetail } from "../../components/ElectionDetailTypes";
import { RaceModeProvider, type RaceModeSlots } from "./RaceModeContext";
import { useRaceMapCampaign } from "./useRaceMapCampaign";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

function deskFor(accessLevel: "owner" | "public", canManage = false): CampaignDesk {
  return {
    campaignId: "c1",
    campaign: { id: "c1", electionId: "e1", candidateId: "cand1", accessLevel },
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
    const { result } = renderHook(() => useRaceMapCampaign(election()), {
      wrapper: wrap(slots(deskFor("owner", true))),
    });
    await waitFor(() => expect(result.current.presence?.levels).toEqual({ OH: 3 }));
    expect(result.current.inPage).toBe(true);
    render(<>{result.current.panelExtra?.("OH")}</>);
    expect(screen.getByText("Your campaign here")).toBeTruthy();
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
});
