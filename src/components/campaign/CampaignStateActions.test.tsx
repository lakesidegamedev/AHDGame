/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CampaignData } from "@/lib/campaigns/dto/campaignView";
import type { CampaignStatePresence } from "@/lib/elections/dto/campaignStatePresence";
import type { StateOperationsView } from "@/lib/elections/dto/stateOperations";
import type { MyCampaign } from "@/app/elections/[id]/blend/useMyCampaign";
import { CampaignStateActions } from "./CampaignStateActions";
import type { CampaignDesk } from "./useCampaignDesk";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/observability/actionBreadcrumb", () => ({ trackAction: vi.fn() }));
vi.mock("@/app/campaign/[id]/components/CanvassingPanel", () => ({
  CanvassingPanel: () => <div>canvassing desk</div>,
}));

const generalPresence: CampaignStatePresence = {
  electionId: "e1",
  phase: "general",
  currentStateId: "PA",
  currentStateName: "Pennsylvania",
  playerActions: 20,
  states: [
    { id: "PA", name: "Pennsylvania", actionCost: 6 },
    { id: "OH", name: "Ohio", actionCost: 5 },
  ],
  primary: null,
};

const hub = {
  electionId: "e1",
  currentTurn: 12,
  positives: {
    camp: {
      currentCampaignState: "PA",
      currentTicks: 1,
      tickCap: 5,
      homeState: "PA",
      surgeUsed: false,
      playerActions: 20,
      playerFunds: 100_000,
      surgeCostFunds: 25_000,
      surgeCostActions: 3,
      surgeBoost: 15,
      states: [{ id: "OH", name: "Ohio", actionCost: 5 }],
    },
    presence: [],
    canvass: { available: true, stateId: "OH", reason: null },
  },
  opponents: [
    { candidateId: "r1", name: "Rival", color: "#EF4444", delegates: 10, liveAgainstThem: [] },
  ],
  liveAgainstYou: [],
  shieldPct: 0,
  campaignFunds: 900_000,
  campaignFxRate: 1,
  countryId: "US",
  attacks: [
    {
      kind: "localFavorability",
      label: "Local attack",
      description: "Costs $40,000 and 4 actions.",
      costFunds: 40_000,
      costActions: 4,
      shielded: false,
    },
  ],
} as unknown as StateOperationsView;

function desk(
  over: Omit<Partial<CampaignDesk>, "campaign"> & { campaign?: Partial<CampaignData> } = {}
): CampaignDesk {
  const { campaign, ...rest } = over;
  return {
    campaignId: "c1",
    campaign: {
      id: "c1",
      electionId: "e1",
      candidateId: "cand1",
      accessLevel: "owner",
      statePresence: null,
      ...campaign,
    } as unknown as CampaignData,
    loading: false,
    error: "",
    me: {
      funds: 1000,
      storedFunds: 1000,
      fundsCurrency: null,
      actions: 20,
      nationalInfluence: 5,
      countryId: "US",
      characterId: "me",
    },
    currentTurn: 12,
    wire: [],
    canManage: true,
    canSurrogate: false,
    stateOps: { view: null, reload: vi.fn() },
    canvassStateId: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    refreshMe: vi.fn().mockResolvedValue(undefined),
    ...rest,
  };
}

function mine(over: Partial<MyCampaign> = {}): MyCampaign {
  return {
    campaignId: "c1",
    race: { id: "e1", countryId: "US" },
    color: "#4F8EF7",
    levels: { OH: 2 },
    rows: { OH: { stateId: "OH", level: 2, nextCost: 100 } },
    canBuild: false,
    canOpenFieldOffice: true,
    busy: null,
    error: null,
    build: vi.fn(),
    ...over,
  };
}

function show(d: CampaignDesk, m: MyCampaign | null = mine(), stateId = "OH") {
  return render(<CampaignStateActions desk={d} stateId={stateId} stateName="Ohio" mine={m} />);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Done." }) })
  );
});

describe("CampaignStateActions", () => {
  it("gives the general-election candidate a one-click travel to the open state", async () => {
    const d = desk({ campaign: { statePresence: generalPresence } });
    show(d);
    fireEvent.click(screen.getByRole("button", { name: /Travel to Ohio \(5 actions\)/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/elections/e1/travel");
    expect(JSON.parse(init.body)).toEqual({ stateId: "OH" });
  });

  it("falls back to the operations hub for camping when no presence payload came", () => {
    show(desk({ stateOps: { view: hub, reload: vi.fn() } }));
    expect(screen.getByRole("button", { name: /Camp in Ohio/ })).toBeTruthy();
    expect(screen.getByTestId("state-operations-here")).toBeTruthy();
  });

  it("attacks a rival in this state and refreshes the desk", async () => {
    const reload = vi.fn();
    const d = desk({ stateOps: { view: hub, reload } });
    show(d);
    fireEvent.click(screen.getByRole("button", { name: /Local attack/ }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([u]) => u === "/api/elections/e1/state-attack"
    )!;
    expect(JSON.parse(call[1].body)).toEqual({
      targetCandidateId: "r1",
      kind: "localFavorability",
      stateId: "OH",
    });
    expect(d.refresh).toHaveBeenCalled();
  });

  it("shows the canvassing desk only in the state canvassing is open in", async () => {
    const { unmount } = show(desk({ canvassStateId: "OH" }));
    expect(await screen.findByText("canvassing desk")).toBeTruthy();
    unmount();
    show(desk({ canvassStateId: "IA" }));
    expect(screen.queryByTestId("state-canvass")).toBeNull();
  });

  it("gives a manager the presence block and canvassing but no travel or attacks", async () => {
    show(desk({ canvassStateId: "OH" }));
    expect(screen.getByText("Your campaign here")).toBeTruthy();
    expect(await screen.findByText("canvassing desk")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Travel/ })).toBeNull();
    expect(screen.queryByTestId("state-operations-here")).toBeNull();
    // A manager does not build presence; the route is the candidate's.
    expect(screen.queryByRole("button", { name: /Build presence/ })).toBeNull();
  });

  it("gives a running mate the presence block but no canvassing and no field office link", () => {
    show(
      desk({ canManage: false, canSurrogate: true, canvassStateId: "OH" }),
      mine({ canOpenFieldOffice: false })
    );
    expect(screen.getByText("Your campaign here")).toBeTruthy();
    expect(screen.queryByTestId("state-canvass")).toBeNull();
    expect(screen.queryByText(/Open a field office/)).toBeNull();
  });

  it("shows a rival or party viewer nothing beyond the public overview", () => {
    for (const accessLevel of ["party", "public"] as const) {
      const { container, unmount } = show(
        desk({
          canManage: false,
          canvassStateId: "OH",
          stateOps: { view: hub, reload: vi.fn() },
          campaign: { accessLevel, statePresence: generalPresence },
        }),
        null
      );
      expect(container.textContent).toBe("");
      unmount();
    }
  });
});
