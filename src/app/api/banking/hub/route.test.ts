import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const state = vi.hoisted(() => ({
  centralBanks: [] as Array<Record<string, unknown>>,
  corporations: [] as Array<Record<string, unknown>>,
  findOne: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn().mockResolvedValue({
    collection: (name: string) => ({
      find: () => ({
        project: () => ({
          toArray: async () =>
            name === "centralBanks"
              ? state.centralBanks
              : name === "corporations"
                ? state.corporations
                : [],
        }),
      }),
      findOne: state.findOne,
    }),
  }),
}));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuth: vi.fn().mockResolvedValue({ ok: true, user: { isAdmin: false, character: null } }),
}));
vi.mock("@/lib/banking/policy", () => ({
  loadBankingPolicy: vi.fn().mockResolvedValue({ privateBanking: true }),
}));
vi.mock("@/lib/banking/rules/policy", () => ({ savingsReadsAuthoritative: () => false }));
vi.mock("@/lib/country/registeredCountries", () => ({
  getRegisteredCountryIds: vi.fn().mockResolvedValue(["US", "UK"]),
}));
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentTurn: 5 }),
}));
vi.mock("@/lib/country/countryIdentity", () => ({
  loadCountryNameOverrides: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/monetaryPolicy/centralBankPricing", () => ({
  loadCentralBankPricingAdjustment: vi.fn().mockResolvedValue({ depositBonusPercentPoints: 0 }),
}));
vi.mock("@/lib/currency/gdpAnchorRate", () => ({ loadWorldEraUnitScale: vi.fn() }));
vi.mock("@/lib/banking/reserves", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/banking/reserves")>()),
  // Echo the reserve ratio so the payload shows which ratio each row used.
  getLendableHeadroom: vi.fn((_charter: unknown, ratio: number) => ratio),
}));

import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { GET } from "./route";

function charteredCorp(name: string, currency: string) {
  return {
    _id: new ObjectId(),
    name,
    countryId: currency === "USD" ? "US" : "UK",
    ceoId: new ObjectId(),
    ceoType: "npp",
    ceoVacant: true,
    bankCharter: {
      status: "active",
      type: "retail",
      currency,
      depositOffset: -1,
      lendingOffset: 2,
      totalDeposits: 0,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.centralBanks = [
    { _id: "US", countryId: "US", name: "Fed", primeRate: 4, bankReserveRequirement: 0.12 },
    { _id: "UK", countryId: "UK", name: "BoE", primeRate: 3 },
  ];
  state.corporations = [
    charteredCorp("A", "USD"),
    charteredCorp("B", "USD"),
    charteredCorp("C", "GBP"),
    charteredCorp("D", "GBP"),
  ];
  vi.mocked(loadWorldEraUnitScale).mockResolvedValue(1);
});

describe("GET /api/banking/hub private-bank table", () => {
  it("prices every charter from the central banks it already loaded, with no per-charter reads", async () => {
    const body = await (await GET()).json();

    expect(state.findOne).not.toHaveBeenCalled();
    expect(loadWorldEraUnitScale).toHaveBeenCalledTimes(1);

    const byName = Object.fromEntries(
      body.privateBanks.map((b: Record<string, unknown>) => [b.name, b])
    );
    // Prime + offsets, as getEffectiveBankRates computes them.
    expect(byName.A).toMatchObject({ depositRatePercent: 3, lendingRatePercent: 6 });
    expect(byName.C).toMatchObject({ depositRatePercent: 2, lendingRatePercent: 5 });
    // Stored requirement wins; a bank without one falls back to the era default.
    expect(byName.A.lendableHeadroom).toBe(0.12);
    expect(byName.B.lendableHeadroom).toBe(0.12);
    expect(byName.C.lendableHeadroom).toBe(0.1);
    expect(byName.D.lendableHeadroom).toBe(0.1);
  });

  it("quotes central-bank savings at half the real prime, as the turn pays it", async () => {
    state.centralBanks = [
      {
        _id: "US",
        countryId: "US",
        name: "Fed",
        primeRate: 20.75,
        inflationHistory: [
          { turn: 3, rate: 5 },
          { turn: 4, rate: 19.8 },
        ],
      },
      { _id: "UK", countryId: "UK", name: "BoE", primeRate: 3 },
    ];
    const body = await (await GET()).json();
    const byCurrency = Object.fromEntries(
      body.centralBanks.map((b: Record<string, unknown>) => [b.currency, b])
    );
    expect(byCurrency.USD.savingsApyPercent).toBeCloseTo((20.75 - 19.8) / 2, 6);
    expect(byCurrency.GBP.savingsApyPercent).toBeCloseTo(1.5, 6);
  });

  it("skips the era lookup when every charter's bank sets its own requirement", async () => {
    state.corporations = [charteredCorp("A", "USD")];
    await GET();
    expect(loadWorldEraUnitScale).not.toHaveBeenCalled();
    expect(state.findOne).not.toHaveBeenCalled();
  });
});
