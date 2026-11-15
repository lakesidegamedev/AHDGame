import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/profile.json";
import tutorialMessages from "../../../messages/en/tutorial.json";
import ProfilePage from "./page";

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/contexts/AuthDataContext", () => ({
  useAuthMe: () => ({ user: null, refetch: vi.fn() }),
}));
// Response-lifecycle writes are outside the profile render being verified.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/achievements/triggers", () => ({
  checkPassiveProfileAchievements: vi.fn(async () => {}),
}));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: profileMessages } = await import("../../../messages/en/profile.json");
  return {
    getLocale: async () => "en",
    getTranslations: async () =>
      createTranslator({
        locale: "en",
        timeZone: "UTC",
        messages: profileMessages,
        namespace: "profile",
      }),
  };
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`Unexpected redirect: ${url}`);
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/profile",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    format: (amount: number) => String(amount),
    formatFull: (amount: number) => String(amount),
    formatAmountChip: (amount: number) => String(amount),
    toInternalFrom: (amount: number) => amount,
    displayCurrencyPreference: "native",
    formatLocal: (amount: number) => String(amount),
    convert: (amount: number) => amount,
    currency: "GBP",
    symbol: "£",
  }),
}));

type Row = Record<string, unknown>;

/** Read-only fixture database. Any attempted write fails instead of silently passing. */
function profileDb(rows: Record<string, Row[]>): Db {
  return {
    collection: (name: string) => ({
      findOne: async () => rows[name]?.[0] ?? null,
      countDocuments: async () => 0,
      find: () => {
        const cursor = {
          sort: () => cursor,
          limit: () => cursor,
          project: () => cursor,
          toArray: async () => rows[name] ?? [],
        };
        return cursor;
      },
      aggregate: () => ({
        toArray: async () => (name === "states" ? groupStatesByCountry(rows.states ?? []) : []),
      }),
    }),
  } as unknown as Db;
}

/** The national GDP read groups states by country; answer it from the fixture rows. */
function groupStatesByCountry(states: Row[]): Row[] {
  const byCountry = new Map<string, { gdp: number; population: number }>();
  for (const state of states) {
    const key = String(state.countryId ?? "US");
    const total = byCountry.get(key) ?? { gdp: 0, population: 0 };
    total.gdp += Number(state.gdp ?? 0);
    total.population += Number(state.population ?? 0);
    byCountry.set(key, total);
  }
  return [...byCountry].map(([_id, total]) => ({ _id, ...total }));
}

describe("successor-country profile server rendering", () => {
  beforeEach(async () => {
    const { resetCorpFxRateCacheForTests } = await import("@/lib/currency/corporationCapital");
    resetCorpFxRateCacheForTests();
  });

  it.each([
    ["SCO", "LOT", "Edinburgh & the Lothians", false],
    ["WAL", "CDF", "Cardiff", false],
    ["IE", "NIR", "Northern Ireland", false],
    ["SCO", "LOT", "Edinburgh & the Lothians", true],
    ["WAL", "CDF", "Cardiff", true],
    ["IE", "NIR", "Northern Ireland", true],
  ] as const)(
    "loads and renders %s / %s / %s (party office-holder: %s)",
    async (countryId, homeState, name, officeHolder) => {
      const userId = new ObjectId();
      const characterId = new ObjectId();
      const { getAuthUser } = await import("@/lib/auth");
      vi.mocked(getAuthUser).mockResolvedValue({
        userId: userId.toHexString(),
        username: "successor-test",
        isAdmin: false,
      } as never);
      const { getDb } = await import("@/lib/mongodb");
      vi.mocked(getDb).mockResolvedValue(
        profileDb({
          users: [
            { _id: userId, activeCharacterId: characterId, createdAt: new Date("2026-01-01") },
          ],
          characters: [
            {
              _id: characterId,
              userId,
              sequentialId: 100,
              name: `${countryId} Profile Test`,
              countryId,
              homeState,
              party: officeHolder ? "1" : "independent",
              policies: { economic: 0, social: 0 },
              donorBaseLevel: 1,
              politicalInfluence: 40,
              nationalInfluence: 10,
              favorability: 50,
              actions: 20,
              funds: 1000,
              cashOnHand: 500,
              currentOffice: officeHolder ? { type: "primeMinister", state: homeState } : null,
              careerHistory: [],
              onboardingDismissed: true,
              createdAt: new Date("2026-01-01"),
            },
          ],
          states: [{ _id: homeState, countryId, name, population: 1000000, gdp: 30000 }],
          gameState: [
            {
              _id: "current",
              preset: "1991-default",
              startingYear: 1991,
              currentYear: 2006,
              currentTurn: 818,
              lastTurnProcessed: new Date("2026-11-11T08:00:00Z"),
              conflictsEnabled: true,
              onboardingChecklistEnabled: false,
              rpgStatsEnabled: false,
            },
          ],
          gameConfig: [{ _id: "default", baseActionsPerTurn: 4 }],
          politicalParties: officeHolder
            ? [
                {
                  _id: new ObjectId(),
                  countryId,
                  sequentialId: 1,
                  name: "Successor Test Party",
                  economicPosition: 0,
                  socialPosition: 0,
                  chairId: characterId,
                  nationalTaxRate: 10,
                },
              ]
            : [],
        })
      );

      const page = await ProfilePage();
      const html = renderToStaticMarkup(
        <NextIntlClientProvider
          locale="en"
          timeZone="UTC"
          messages={{ ...messages, ...tutorialMessages }}
        >
          {page}
        </NextIntlClientProvider>
      );
      expect(html).toContain(`${countryId} Profile Test`);
      expect(html).toContain(name.replaceAll("&", "&amp;"));
      expect(html).toContain("Career history");
      expect(html).toContain("Finances");
      if (officeHolder) expect(html).toContain("Successor Test Party");
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("Infinity");
    }
  );
});
