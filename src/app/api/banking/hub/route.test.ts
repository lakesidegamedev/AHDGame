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
vi.mock("@/lib/banking/lending", () => ({
  averageCorpIncomePerTurn: vi.fn().mockResolvedValue(0),
  characterIncomeInLoanCurrency: vi.fn().mockResolvedValue(0),
  listBorrowerFacingLoans: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/currency/corporationCapital", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/corporationCapital")>()),
  loadFxRatesByCurrency: vi.fn().mockResolvedValue(new Map()),
  loadValuationFxRates: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/banking/reserves", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/banking/reserves")>()),
  // Echo the reserve ratio so the payload shows which ratio each row used.
  getLendableHeadroom: vi.fn((_charter: unknown, ratio: number) => ratio),
}));

import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { requireAuth } from "@/lib/api/requireAuth";
import { loadCentralBankPricingAdjustment } from "@/lib/monetaryPolicy/centralBankPricing";
import { GET } from "./route";

function charteredCorp(name: string, currency: string, depositOffset = -1) {
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
      depositOffset,
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
          { turn: 4, rate: 19.75 },
        ],
      },
      { _id: "UK", countryId: "UK", name: "BoE", primeRate: 3 },
    ];
    const body = await (await GET()).json();
    const byCurrency = Object.fromEntries(
      body.centralBanks.map((b: Record<string, unknown>) => [b.currency, b])
    );
    expect(byCurrency.USD.savingsApyPercent).toBe(0.5);
    expect(byCurrency.GBP.savingsApyPercent).toBeCloseTo(1.5, 6);
  });

  it("prices each savings holder option at what the saver earns there, as the desk does", async () => {
    // Prime 10, inflation 4: base = 3, CB APY = 3 + 0.25 bonus = 3.25.
    state.centralBanks = [
      {
        _id: "US",
        countryId: "US",
        name: "Fed",
        primeRate: 10,
        inflationHistory: [{ turn: 4, rate: 4 }],
      },
      { _id: "UK", countryId: "UK", name: "BoE", primeRate: 3 },
    ];
    state.corporations = [charteredCorp("A", "USD"), charteredCorp("Low", "USD", -9.5)];
    vi.mocked(loadCentralBankPricingAdjustment).mockResolvedValueOnce({
      depositBonusPercentPoints: 0.25,
    } as Awaited<ReturnType<typeof loadCentralBankPricingAdjustment>>);
    vi.mocked(requireAuth).mockResolvedValueOnce({
      ok: true,
      user: {
        isAdmin: false,
        character: {
          _id: new ObjectId(),
          userId: new ObjectId(),
          countryId: "US",
          currencyBalances: { savings: { USD: 100 } },
        },
      },
    } as unknown as Awaited<ReturnType<typeof requireAuth>>);

    const body = await (await GET()).json();
    const usd = body.savings.find((row: { currency: string }) => row.currency === "USD");
    const rateBy = Object.fromEntries(
      usd.options.map((o: { label: string; depositRatePercent: number }) => [
        o.label,
        o.depositRatePercent,
      ])
    );
    expect(rateBy["Fed (central bank)"]).toBe(3.25);
    // Posted 9: premium 9 - 3 = 6, plus the 3.25 CB APY that still accrues.
    expect(rateBy.A).toBe(9.25);
    // Posted 0.5 sits below base: no premium, but the CB APY still accrues.
    expect(rateBy.Low).toBe(3.25);
    // The bank's own posted rate is unchanged in the private-bank table.
    const posted = Object.fromEntries(
      body.privateBanks.map((b: { name: string; depositRatePercent: number }) => [
        b.name,
        b.depositRatePercent,
      ])
    );
    expect(posted).toMatchObject({ A: 9, Low: 0.5 });
    const saver = Object.fromEntries(
      body.privateBanks.map((b: { name: string; saverApyPercent: number }) => [
        b.name,
        b.saverApyPercent,
      ])
    );
    expect(saver).toMatchObject({ A: 9.25, Low: 3.25 });
  });

  it("skips the era lookup when every charter's bank sets its own requirement", async () => {
    state.corporations = [charteredCorp("A", "USD")];
    await GET();
    expect(loadWorldEraUnitScale).not.toHaveBeenCalled();
    expect(state.findOne).not.toHaveBeenCalled();
  });
});
