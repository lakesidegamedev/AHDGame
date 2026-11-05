/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CampaignData } from "@/lib/campaigns/dto/campaignView";
import { CampaignDeskView } from "./CampaignWorkspace";
import type { CampaignDesk } from "./useCampaignDesk";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/campaign/[id]/blend/CampaignBlendClient", () => ({
  CampaignBlendClient: () => <div>blend</div>,
}));
vi.mock("@/app/campaign/[id]/components/CanvassingPanel", () => ({
  CanvassingPanel: () => <div>canvassing desk</div>,
}));
vi.mock("@/app/campaign/[id]/components/TargetedAdsPanel", () => ({
  TargetedAdsPanel: () => <div>targeted ads</div>,
}));
vi.mock("@/app/campaign/[id]/components/SuspendEndorsePanel", () => ({
  SuspendEndorsePanel: () => null,
}));

function desk(canManage = true): CampaignDesk {
  return {
    campaignId: "c1",
    campaign: {
      id: "c1",
      electionId: "e1",
      accessLevel: "owner",
      isArchived: false,
      electionInfo: { electionType: "president", isEnded: false, state: "US" },
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
    canManage,
    canSurrogate: false,
    stateOps: { view: null, reload: vi.fn() },
    canvassStateId: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    refreshMe: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(cleanup);

describe("CampaignDeskView canvassing", () => {
  it("shows the desk's canvassing panel to a manager everywhere when the map is not the way in", async () => {
    render(<CampaignDeskView desk={desk()} variant="inline" />);
    const wrap = (await screen.findByText("canvassing desk")).closest("[data-testid=desk-canvass]");
    expect(wrap?.className).not.toContain("lg:hidden");
  });

  it("hides it on desktop when the map carries canvassing, and keeps it on phones", async () => {
    render(<CampaignDeskView desk={desk()} variant="inline" stateActionsOnMap />);
    const wrap = (await screen.findByText("canvassing desk")).closest("[data-testid=desk-canvass]");
    expect(wrap?.className).toBe("lg:hidden");
  });

  it("offers no canvassing to someone who cannot manage the campaign", () => {
    render(<CampaignDeskView desk={desk(false)} variant="inline" stateActionsOnMap />);
    expect(screen.queryByText("canvassing desk")).toBeNull();
  });
});
