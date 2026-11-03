// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { buildRaceIndex, type CmRace, type SeatCycle } from "@/lib/campaignManager/rules";
import { election } from "@/lib/campaignManager/rules/__fixtures__/election";
import CampaignManagerClient, { type CampaignManagerClientProps } from "./CampaignManagerClient";

const mocks = vi.hoisted(() => ({
  races: [] as CmRace[],
  cycles: [] as SeatCycle[],
  finished: vi.fn(() => ({ races: [], loading: false })),
  actions: vi.fn(() => ({ character: null })),
}));
vi.mock("./useRaceIndex", () => ({
  useRaceIndex: () => ({
    races: mocks.races,
    currentTurn: 10,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));
vi.mock("./useFinishedRaces", () => ({
  useFinishedRaces: mocks.finished,
  useFinishedCount: () => 1,
}));
vi.mock("./useSeatHistory", () => ({ useSeatHistory: () => ({ cycles: mocks.cycles }) }));
vi.mock("./useRaceDetail", () => ({ useRaceDetail: () => ({ full: null, wire: [] }) }));
vi.mock("./useWatchedRaces", () => ({
  useWatchedRaces: () => ({ watched: new Set(), toggle: vi.fn() }),
}));
vi.mock("./useIsDesktop", () => ({ useIsDesktop: () => true }));
vi.mock("./useElementWidth", () => ({ useElementWidth: () => [null, 1200] }));
vi.mock("@/app/actions/useActionsController", () => ({ useActionsController: mocks.actions }));
vi.mock("@/hooks/useConfirmDialog", () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(), dialog: null }),
}));
vi.mock("@/components/elections/raceEntry/useRaceEntry", () => ({
  useRaceEntry: () => ({}),
  needsConstituencyPicker: () => false,
}));
vi.mock("@/components/blend/BlendShell", () => ({
  BlendShell: ({ children, right }: { children: ReactNode; right: ReactNode }) => (
    <>
      {children}
      {right}
    </>
  ),
}));
vi.mock("./components/RaceView", () => ({ RaceView: ({ nav }: { nav: ReactNode }) => <>{nav}</> }));
vi.mock("./map/CampaignMap", () => ({ CampaignMap: () => null }));
vi.mock("./components/TargetPanel", () => ({ TargetPanel: () => <div>target actions</div> }));
vi.mock("./components/MyMovesPanel", () => ({ MyMovesPanel: () => <div>my actions</div> }));
vi.mock("@/app/actions/components/CampaignActionModal", () => ({
  CampaignActionModal: () => null,
}));

const props: CampaignManagerClientProps = {
  countryId: "UK",
  countryName: "United Kingdom",
  regionNoun: "Region",
  regionNounPlural: "Regions",
  regionNames: { SCO: "Scotland" },
  nationalChamberKeys: ["commons"],
  characterId: "viewer",
  homeRegionId: "SCO",
  initialRaceKey: "e1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.races = buildRaceIndex(
    [election({ electionType: "snap_commons", countryId: "UK", state: "SCO" })],
    { currentTurn: 10, nationalChamberKeys: ["commons"] }
  );
  mocks.cycles = [];
});
afterEach(cleanup);

it("loads Finished directly from the initial URL filter", () => {
  renderWithElectionsMessages(
    <CampaignManagerClient
      {...props}
      initialRaceKey={null}
      initialFilter={{ type: "commons", stage: "final" }}
    />
  );
  expect(mocks.finished).toHaveBeenLastCalledWith(
    "UK",
    "commons",
    true,
    props.nationalChamberKeys,
    10
  );
});

it.each([
  ["snap_commons", "commons"],
  ["commons", "snap_commons"],
  ["snap_shugiin", "shugiin"],
])("opens %s history at the destination %s type", (currentType, previousType) => {
  mocks.races[0].electionType = currentType;
  mocks.cycles = [
    {
      electionId: "e1",
      electionType: currentType,
      cycle: 2,
      year: 2000,
      state: "live",
      winner: null,
      margin: null,
      seatSplit: null,
      primaries: [],
    },
    {
      electionId: "old",
      electionType: previousType,
      cycle: 1,
      year: 1996,
      state: "final",
      winner: null,
      margin: null,
      seatSplit: null,
      primaries: [],
    },
  ];
  renderWithElectionsMessages(<CampaignManagerClient {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Previous race, 1996" }));
  expect(mocks.finished).toHaveBeenLastCalledWith(
    "UK",
    previousType,
    true,
    props.nationalChamberKeys,
    10
  );
});

it("keeps guest race browsing visible without mounting action controls", () => {
  renderWithElectionsMessages(<CampaignManagerClient {...props} characterId="" />);
  expect(screen.getByRole("heading", { name: "Campaign Manager" })).toBeTruthy();
  expect(screen.getByText(/Sign in with a character/)).toBeTruthy();
  expect(screen.queryByText("target actions")).toBeNull();
  expect(screen.queryByText("my actions")).toBeNull();
  expect(mocks.actions).toHaveBeenCalledWith({ viewMode: "compact", enabled: false });
});
