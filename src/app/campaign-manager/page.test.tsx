import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import CampaignManagerPage from "./page";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUserWithCharacter: mocks.auth }));
vi.mock("@/lib/mongodb", () => ({ getDb: mocks.db }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/constants/countries", () => ({ getCountryConfig: () => ({}) }));
vi.mock("@/lib/country/countryIdentity", () => ({ loadCountryNameOverrides: async () => ({}) }));
vi.mock("@/lib/db/collections/gameState", () => ({ getGameStatePreset: async () => "1991" }));
vi.mock("@/lib/campaignManager/countryView", () => ({
  campaignManagerCountryView: () => ({
    countryName: "United Kingdom",
    regionNoun: "Region",
    regionNounPlural: "Regions",
    nationalChamberKeys: ["commons"],
  }),
}));
vi.mock("./CampaignManagerClient", () => ({ default: () => null }));

beforeEach(() => vi.clearAllMocks());

it.each([null, { hasCharacter: false, character: null }])(
  "serves a linked public result without requiring a character (%j)",
  async (viewer) => {
    const db = createMockDb();
    const id = new ObjectId();
    db.collection("elections").findOne.mockResolvedValue({
      _id: id,
      electionType: "commons",
      countryId: "UK",
    });
    db.collection("states").find.mockReturnValue({
      toArray: async () => [{ _id: "SCO", name: "Scotland" }],
    });
    db.collection("countryGameStates").findOne.mockResolvedValue(null);
    mocks.db.mockResolvedValue(db);
    mocks.auth.mockResolvedValue(viewer);
    const page = await CampaignManagerPage({
      searchParams: Promise.resolve({ race: id.toHexString() }),
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(page.props).toMatchObject({
      countryId: "UK",
      characterId: "",
      homeRegionId: null,
      initialRaceKey: id.toHexString(),
    });
  }
);
