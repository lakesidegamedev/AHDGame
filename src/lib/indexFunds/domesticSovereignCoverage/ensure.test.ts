import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";

vi.mock("@/lib/db/sessionDb", () => ({
  withSessionDb: async (db: Db, work: (db: Db) => Promise<unknown>) => work(db),
}));
vi.mock("@/lib/country/registeredCountries", () => ({
  getRegisteredCountryIds: vi.fn(),
}));

import { getRegisteredCountryIds } from "@/lib/country/registeredCountries";
import { ensureDomesticSovereignBondFunds } from "./ensure";

const registeredMock = vi.mocked(getRegisteredCountryIds);

function mockDb(fixture: {
  budgets?: { _id: string }[];
  liveIssuers?: string[];
  funds?: { slug: string; countryId?: string; anchorCurrencyCode: string; scope: string }[];
  existingSlugs?: string[];
}) {
  const insertMany = vi.fn().mockResolvedValue({ acknowledged: true });
  const bulkWrite = vi.fn().mockResolvedValue({ acknowledged: true });
  const collections: Record<string, unknown> = {
    federalBudget: {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(fixture.budgets ?? []) })),
    },
    bonds: {
      distinct: vi.fn().mockResolvedValue(fixture.liveIssuers ?? []),
    },
    indexFunds: {
      find: vi.fn((query: unknown) => ({
        toArray: vi
          .fn()
          .mockResolvedValue(
            String(JSON.stringify(query)).includes("slug")
              ? (fixture.existingSlugs ?? []).map((slug) => ({ slug }))
              : (fixture.funds ?? [])
          ),
      })),
      insertMany,
    },
    indexFundPositions: { bulkWrite },
  };
  const db = {
    collection: vi.fn((name: string) => collections[name]),
  } as unknown as Db;
  return { db, insertMany, bulkWrite };
}

beforeEach(() => {
  vi.clearAllMocks();
  registeredMock.mockResolvedValue(["US", "FR"]);
});

describe("ensureDomesticSovereignBondFunds (#1001)", () => {
  it("writes nothing when the gate is off", async () => {
    const { db } = mockDb({});
    const result = await ensureDomesticSovereignBondFunds(db, { enabled: false });
    expect(result).toEqual({ ensured: [] });
    expect(db.collection).not.toHaveBeenCalled();
    expect(registeredMock).not.toHaveBeenCalled();
  });

  it("ensures the uncovered issuer with a domestic-only fund and leaves the covered one alone", async () => {
    const { db, insertMany, bulkWrite } = mockDb({
      budgets: [{ _id: "federal" }, { _id: "FR" }],
      liveIssuers: ["US", "FR"],
      funds: [
        {
          slug: "us_sovereign_bonds",
          countryId: "US",
          anchorCurrencyCode: "USD",
          scope: "country",
        },
      ],
    });
    const result = await ensureDomesticSovereignBondFunds(db, { enabled: true });
    expect(result).toEqual({ ensured: ["FR"] });
    expect(insertMany).toHaveBeenCalledTimes(1);
    const doc = insertMany.mock.calls[0]?.[0]?.[0] as Record<string, unknown>;
    expect(doc).toMatchObject({
      slug: "fr_sovereign_bonds",
      scope: "country",
      kind: "bond",
      countryId: "FR",
      status: "active",
      quotedNav: 100,
      unitSupply: 500_000,
      reserveUnits: 500_000,
      cashAnchor: 50_000_000,
      holdings: [],
    });
    // Fully backed at seed: 50M cash against 100 x 500k quoted liability.
    expect(doc.cashAnchor).toBe((doc.quotedNav as number) * (doc.unitSupply as number));
    expect(bulkWrite).toHaveBeenCalledTimes(1);
  });

  it("ensures nothing when no issuer is eligible (no domestic fund to extend to)", async () => {
    const { db, insertMany } = mockDb({
      budgets: [{ _id: "federal" }],
      liveIssuers: ["US"],
      funds: [
        {
          slug: "us_sovereign_bonds",
          countryId: "US",
          anchorCurrencyCode: "USD",
          scope: "country",
        },
      ],
    });
    const result = await ensureDomesticSovereignBondFunds(db, { enabled: true });
    expect(result).toEqual({ ensured: [] });
    expect(insertMany).not.toHaveBeenCalled();
  });

  it("never duplicates a fund the seed migration already created", async () => {
    const { db, insertMany } = mockDb({
      budgets: [{ _id: "federal" }, { _id: "FR" }],
      liveIssuers: ["US", "FR"],
      funds: [
        {
          slug: "us_sovereign_bonds",
          countryId: "US",
          anchorCurrencyCode: "USD",
          scope: "country",
        },
      ],
      existingSlugs: ["fr_sovereign_bonds"],
    });
    const result = await ensureDomesticSovereignBondFunds(db, { enabled: true });
    expect(result).toEqual({ ensured: [] });
    expect(insertMany).not.toHaveBeenCalled();
  });
});
