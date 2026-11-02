import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../../messages/en/nav.json";

const mocks = vi.hoisted(() => ({
  clientNav: vi.fn(),
  president: vi.fn(),
  referendums: vi.fn(),
}));

vi.mock("@/app/api/client-nav/route", () => ({ GET: mocks.clientNav }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "en", messages: en, namespace } as never),
}));
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => ({ collection: () => ({ findOne: mocks.president }) }),
}));
vi.mock("@/lib/countryAccess", () => ({ getEnabledCountryIds: async () => ["US", "UK"] }));
vi.mock("@/lib/db/collections/gameState", () => ({ getGameStatePreset: async () => null }));
vi.mock("@/lib/country/countryIdentity", () => ({ loadCountryNameOverrides: async () => ({}) }));
vi.mock("@/lib/db/collections/referendum", () => ({
  getReferendumCollection: () => ({ countDocuments: mocks.referendums }),
}));

import { GET } from "./route";

const navBody = {
  user: { id: "u1", username: "viewer", isAdmin: false, isModerator: false, singleplayer: false },
  hasCharacter: true,
  characterCountryId: "US",
  characterName: "Pat Doe",
  unreadCount: 12,
  myCorporationId: 7,
  myCorporationHasGroup: false,
  myUnionId: null,
  homeState: { id: "NY", name: "New York", countryId: "US" },
  currentParty: null,
  activeElection: null,
  cabinetOffice: null,
  justiceOffice: null,
  governorOffice: null,
  isImperialMode: false,
  wikiDisabled: false,
  conflictsEnabled: false,
  settlementCrisisLive: false,
  unionsEnabled: false,
  pendingCharterCount: 0,
};

const request = (query = "") => new Request(`http://localhost/api/mobile-dock${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.president.mockResolvedValue(null);
  mocks.referendums.mockResolvedValue(0);
  mocks.clientNav.mockResolvedValue(Response.json(navBody));
});

describe("GET /api/mobile-dock", () => {
  it("answers 401 with no-store when signed out", async () => {
    mocks.clientNav.mockResolvedValue(
      Response.json({ ...navBody, user: null, hasCharacter: false })
    );
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns the five tabs and three sheets, never cached", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.tabs.map((tab: { id: string }) => tab.id)).toEqual([
      "company",
      "state",
      "nation",
      "actions",
      "more",
    ]);
    expect(body.tabs[0]).toMatchObject({
      label: "Company",
      href: "/corporation/7",
      activePrefixes: ["/corporation/7"],
    });
    expect(body.tabs[1]).toMatchObject({ label: "New York", sheet: "state" });
    expect(body.tabs[2]).toMatchObject({ label: "United States", sheet: "nation" });
    expect(body.tabs[4]).toMatchObject({ id: "more", sheet: "more" });
    expect(Object.keys(body.sheets).sort()).toEqual(["more", "nation", "state"]);
    for (const tab of body.tabs) {
      expect(tab.icon.grid).toHaveLength(11);
      expect(tab.href === undefined).toBe(tab.sheet !== undefined);
    }
  });

  it("puts the player's own links first in More, with the unread count on notifications", async () => {
    const body = await (await GET(request())).json();
    const more = body.sheets.more;
    expect(more.sections[0].title).toBe("You");
    const links = more.sections.flatMap((s: { links: { id: string; label: string }[] }) => s.links);
    expect(links.find((l: { id: string }) => l.id === "notifications").label).toBe(
      "Notifications (9+)"
    );
    expect(links.map((l: { id: string }) => l.id)).toEqual(
      expect.arrayContaining(["profile", "settings", "guides"])
    );
    // No staff section for a regular player.
    expect(more.sections.some((s: { id: string }) => s.id.startsWith("staff"))).toBe(false);
  });

  it("offers a country switcher and follows ?country=", async () => {
    const body = await (await GET(request("?country=uk"))).json();
    expect(body.tabs[2]).toMatchObject({ label: "United Kingdom", sheet: "nation" });
    const switcher = body.sheets.nation.sections[0];
    expect(switcher.id).toBe("switch-country");
    expect(switcher.links.map((l: { href: string }) => l.href)).toEqual([
      "/country/us",
      "/country/uk",
    ]);
  });

  it("ignores a country that is not enabled", async () => {
    const body = await (await GET(request("?country=ZZ"))).json();
    expect(body.tabs[2].label).toBe("United States");
  });

  it("returns no tabs for a signed-in player with no character", async () => {
    mocks.clientNav.mockResolvedValue(Response.json({ ...navBody, hasCharacter: false }));
    const body = await (await GET(request())).json();
    expect(body).toEqual({ version: 1, tabs: [], sheets: {} });
  });

  it("swaps company for market without a company and drops Actions in imperial mode", async () => {
    mocks.clientNav.mockResolvedValue(
      Response.json({ ...navBody, myCorporationId: null, isImperialMode: true })
    );
    const body = await (await GET(request())).json();
    expect(body.tabs.map((tab: { id: string }) => tab.id)).toEqual([
      "market",
      "state",
      "nation",
      "more",
    ]);
  });

  it("adds the staff section for staff", async () => {
    mocks.clientNav.mockResolvedValue(
      Response.json({ ...navBody, user: { ...navBody.user, isAdmin: true } })
    );
    const body = await (await GET(request())).json();
    expect(body.sheets.more.sections.some((s: { id: string }) => s.id.startsWith("staff"))).toBe(
      true
    );
  });

  it("passes a client-nav failure through, uncached", async () => {
    mocks.clientNav.mockResolvedValue(Response.json({ error: "boom" }, { status: 500 }));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
