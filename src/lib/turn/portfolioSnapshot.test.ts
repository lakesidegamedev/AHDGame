import { describe, it, expect, vi, beforeEach } from "vitest";
import { snapshotPortfolioValues, snapshotCorporationPortfolioValues } from "./portfolioSnapshot";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { resetCorpFxRateCacheForTests } from "@/lib/currency/corporationCapital";

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/currency/featureFlag", () => ({
  isForexEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/currency/corporationCapital", async () => {
  const actual = await vi.importActual<typeof import("@/lib/currency/corporationCapital")>(
    "@/lib/currency/corporationCapital"
  );
  return {
    ...actual,
    loadFxRatesByCurrency: vi.fn().mockResolvedValue(new Map()),
  };
});

import { getDb } from "@/lib/mongodb";
import { isForexEnabled } from "@/lib/currency/featureFlag";

describe("portfolioSnapshot", () => {
  let mockDb: Db;
  let mockCollection: ReturnType<typeof vi.fn>;
  let mockInsertMany: ReturnType<typeof vi.fn>;

  // Every chain also answers insertMany, so adding a read to the snapshot does
  // not shift each test's mockReturnValueOnce queue onto the wrong shape: the
  // insert still lands on the tracked spy whatever position it ends up in.
  const createMockChain = (result: any[]) => ({
    find: vi.fn().mockReturnThis(),
    project: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(result),
    // `loadValuationFxRates` reads gameState.preset via findOne to pick the era
    // fallback rate. Null keeps the valuation map equal to the settlement map
    // here, which is what these already-anchored fixtures assume.
    findOne: vi.fn().mockResolvedValue(null),
    insertMany: (...args: unknown[]) => (mockInsertMany as (...a: unknown[]) => unknown)(...args),
  });

  beforeEach(() => {
    mockInsertMany = vi.fn();
    mockCollection = vi.fn();

    mockDb = {
      collection: mockCollection,
    } as unknown as Db;

    vi.mocked(getDb).mockResolvedValue(mockDb);
    vi.clearAllMocks();
    vi.mocked(isForexEnabled).mockResolvedValue(false);
    // Without this the FX map stays cached across tests, so whether
    // `loadValuationFxRates` reads `exchangeRates` at all depends on test
    // order and the queued mock sequences below drift. Matches
    // stockExchangeSnapshot.test.ts.
    resetCorpFxRateCacheForTests();
    // Default for any collection the individual tests do not queue explicitly
    // (index-fund positions and definitions), so adding a read to the snapshot
    // does not shift every test's mockReturnValueOnce sequence.
    mockCollection.mockReturnValue(createMockChain([]));
  });

  describe("snapshotPortfolioValues", () => {
    it("snapshots bucket values without extra reads, including cash-only and imperial owners", async () => {
      const regular = new ObjectId(),
        imperial = new ObjectId(),
        cashOnly = new ObjectId();
      const corporations = [
        {
          _id: new ObjectId(),
          sharePrice: 10,
          shareholders: [
            {
              characterId: regular,
              shares: 10,
              holdingTerms: {
                longTermShares: 4,
                longTermCostBasisAnchor: 8,
                shortTermLots: [{ shares: 6, acquiredTurn: 100, costBasisAnchor: 12 }],
              },
            },
            { imperialCharacterId: imperial, shares: 3 },
          ],
        },
      ];
      const prepare = () => {
        mockCollection.mockReturnValueOnce(createMockChain([{ _id: cashOnly, cashOnHand: 25 }]));
        mockCollection.mockReturnValueOnce(createMockChain([]));
        mockCollection.mockReturnValueOnce(createMockChain(corporations));
        mockCollection.mockReturnValueOnce(createMockChain([]));
      };
      prepare();
      await snapshotPortfolioValues(147);
      const legacyCalls = mockCollection.mock.calls.length;
      expect(mockInsertMany.mock.calls[0][0][0]).not.toHaveProperty("shortTermStockValue");
      mockCollection.mockClear();
      mockInsertMany.mockClear();
      resetCorpFxRateCacheForTests();
      prepare();
      await snapshotPortfolioValues(147, 100);
      expect(mockCollection.mock.calls.length).toBe(legacyCalls);
      const rows = mockInsertMany.mock.calls[0][0] as Array<{
        characterId: ObjectId;
        stockValue: number;
        shortTermStockValue: number;
        longTermStockValue: number;
      }>;
      expect(rows.find((row) => row.characterId.equals(regular))).toMatchObject({
        stockValue: 100,
        shortTermStockValue: 60,
        longTermStockValue: 40,
      });
      expect(rows.find((row) => row.characterId.equals(imperial))).toMatchObject({
        stockValue: 30,
        shortTermStockValue: 0,
        longTermStockValue: 30,
      });
      expect(rows.find((row) => row.characterId.equals(cashOnly))).toMatchObject({
        stockValue: 0,
        shortTermStockValue: 0,
        longTermStockValue: 0,
      });
    });
    it("values the total and the short-term split of an all-short holding the same way", async () => {
      const charId = new ObjectId();
      const { isForexEnabled } = await import("@/lib/currency/featureFlag");
      vi.mocked(isForexEnabled).mockResolvedValue(true);
      const shares = 123_456_789;
      const corporations = [
        {
          _id: new ObjectId(),
          sharePrice: 217.31,
          liquidCurrencyCode: "USD",
          countryId: "US",
          shareholders: [
            {
              characterId: charId,
              shares,
              holdingTerms: {
                longTermShares: 0,
                longTermCostBasisAnchor: 0,
                shortTermLots: [{ shares, acquiredTurn: 100, costBasisAnchor: 0 }],
              },
            },
          ],
        },
      ];
      const usdRates = [{ currencyCode: "USD", rate: 0.92 }];
      mockCollection.mockReturnValueOnce(createMockChain(usdRates)); // exchangeRates (forex wealth)
      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain(corporations));
      mockCollection.mockReturnValueOnce(createMockChain([])); // bonds
      mockCollection.mockReturnValueOnce(createMockChain(usdRates)); // exchangeRates (valuation map)
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await expect(snapshotPortfolioValues(147, 100)).resolves.toBe(1);

      const [row] = mockInsertMany.mock.calls[0][0] as Array<{
        stockValue: number;
        shortTermStockValue: number;
        longTermStockValue: number;
      }>;
      expect(row.shortTermStockValue).toBe(row.stockValue);
      expect(row.longTermStockValue).toBe(0);
    });
    describe("look-through of stakes held by a character's corporations", () => {
      type Row = {
        characterId: ObjectId;
        totalValue: number;
        netValue: number;
        stockValue: number;
        shortTermStockValue?: number;
        longTermStockValue?: number;
      };
      async function snapshot(
        characters: Array<Record<string, unknown>>,
        corporations: Array<Record<string, unknown>>,
        stockHoldingTaxStartTurn?: number
      ): Promise<Row[]> {
        mockCollection.mockReturnValueOnce(createMockChain(characters));
        mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
        mockCollection.mockReturnValueOnce(createMockChain(corporations));
        mockCollection.mockReturnValueOnce(createMockChain([])); // bonds
        await snapshotPortfolioValues(147, stockHoldingTaxStartTurn);
        return mockInsertMany.mock.calls[0][0] as Row[];
      }
      const owner = (characterId: ObjectId, shares: number) => ({ characterId, shares });
      const stake = (corporationId: ObjectId, shares: number) => ({ corporationId, shares });

      it("counts a subsidiary held only through the character's corporation", async () => {
        const char = new ObjectId();
        const parentId = new ObjectId();
        const subId = new ObjectId();
        const rows = await snapshot(
          [{ _id: char, cashOnHand: 1_000 }],
          [
            { _id: parentId, sharePrice: 50, totalShares: 100, shareholders: [owner(char, 100)] },
            {
              _id: subId,
              sharePrice: 10,
              totalShares: 1000,
              shareholders: [stake(parentId, 1000)],
            },
          ]
        );
        // direct 100 x 50, plus the parent's 1,000 x 10 subsidiary shares, plus cash
        expect(rows[0]).toMatchObject({
          stockValue: 15_000,
          totalValue: 16_000,
          netValue: 16_000,
        });
      });

      it("attributes only the character's share of a partly owned parent", async () => {
        const char = new ObjectId();
        const other = new ObjectId();
        const parentId = new ObjectId();
        const subId = new ObjectId();
        const rows = await snapshot(
          [{ _id: char }, { _id: other }],
          [
            {
              _id: parentId,
              sharePrice: 50,
              totalShares: 100,
              shareholders: [owner(char, 40), owner(other, 60)],
            },
            {
              _id: subId,
              sharePrice: 10,
              totalShares: 1000,
              shareholders: [stake(parentId, 1000)],
            },
          ]
        );
        expect(rows.find((r) => r.characterId.equals(char))?.stockValue).toBe(2_000 + 4_000);
        expect(rows.find((r) => r.characterId.equals(other))?.stockValue).toBe(3_000 + 6_000);
      });

      it("follows a chain from parent to subsidiary to sub-subsidiary", async () => {
        const char = new ObjectId();
        const pId = new ObjectId();
        const sId = new ObjectId();
        const tId = new ObjectId();
        const rows = await snapshot(
          [{ _id: char }],
          [
            { _id: pId, sharePrice: 1, totalShares: 100, shareholders: [owner(char, 100)] },
            { _id: sId, sharePrice: 10, totalShares: 100, shareholders: [stake(pId, 50)] },
            { _id: tId, sharePrice: 20, totalShares: 100, shareholders: [stake(sId, 100)] },
          ]
        );
        // P direct 100; P's 50 of S = 500; S's whole of T = 2,000, half of it P's via S
        expect(rows[0].stockValue).toBe(100 + 500 + 1_000);
      });

      it("terminates on a cross-holding loop", async () => {
        const char = new ObjectId();
        const aId = new ObjectId();
        const bId = new ObjectId();
        const rows = await snapshot(
          [{ _id: char }],
          [
            {
              _id: aId,
              sharePrice: 10,
              totalShares: 100,
              shareholders: [owner(char, 100), stake(bId, 50)],
            },
            { _id: bId, sharePrice: 10, totalShares: 100, shareholders: [stake(aId, 50)] },
          ]
        );
        expect(Number.isFinite(rows[0].stockValue)).toBe(true);
        expect(rows[0].stockValue).toBeGreaterThan(1_000);
        expect(rows[0].netValue).toBe(rows[0].totalValue);
      });

      it("leaves the history unchanged when no corporation holds a stake", async () => {
        const char = new ObjectId();
        const rows = await snapshot(
          [{ _id: char, cashOnHand: 5 }],
          [
            {
              _id: new ObjectId(),
              sharePrice: 10,
              totalShares: 100,
              shareholders: [owner(char, 10)],
            },
          ]
        );
        expect(rows[0]).toMatchObject({ stockValue: 100, totalValue: 105 });
      });

      it("puts look-through value in the long-term bucket and keeps the split consistent", async () => {
        const char = new ObjectId();
        const parentId = new ObjectId();
        const subId = new ObjectId();
        const rows = await snapshot(
          [{ _id: char }],
          [
            {
              _id: parentId,
              sharePrice: 50,
              totalShares: 100,
              shareholders: [
                {
                  characterId: char,
                  shares: 100,
                  holdingTerms: {
                    longTermShares: 0,
                    longTermCostBasisAnchor: 0,
                    shortTermLots: [{ shares: 100, acquiredTurn: 100, costBasisAnchor: 0 }],
                  },
                },
              ],
            },
            {
              _id: subId,
              sharePrice: 10,
              totalShares: 1000,
              shareholders: [stake(parentId, 1000)],
            },
          ],
          100
        );
        expect(rows[0]).toMatchObject({
          stockValue: 15_000,
          shortTermStockValue: 5_000,
          longTermStockValue: 10_000,
        });
      });

      it("matches the wealth ranking's stock value for the same corporations", async () => {
        const { sumStockValueByCharacter } = await import("@/lib/wealth/computeCharacterWealth");
        const char = new ObjectId();
        const pId = new ObjectId();
        const sId = new ObjectId();
        const tId = new ObjectId();
        const corporations = [
          { _id: pId, sharePrice: 3, totalShares: 200, shareholders: [owner(char, 80)] },
          {
            _id: sId,
            sharePrice: 12,
            totalShares: 500,
            shareholders: [stake(pId, 120), owner(char, 7)],
          },
          {
            _id: tId,
            sharePrice: 4,
            totalShares: 90,
            shareholders: [stake(sId, 30), stake(pId, 10)],
          },
        ];
        const ranked = sumStockValueByCharacter(
          corporations as never,
          new Set([char.toString()]),
          new Map()
        ).get(char.toString());
        const rows = await snapshot([{ _id: char }], corporations);
        expect(rows[0].stockValue).toBeCloseTo(ranked ?? NaN, 2);
      });
    });

    it("returns 0 when no corporations have shareholders", async () => {
      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce({
        find: vi.fn().mockReturnThis(),
        project: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      });
      mockCollection.mockReturnValueOnce({
        find: vi.fn().mockReturnThis(),
        project: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      });

      const result = await snapshotPortfolioValues(100);

      expect(result).toBe(0);
      expect(mockInsertMany).not.toHaveBeenCalled();
    });

    it("snapshots share holdings correctly", async () => {
      const char1Id = new ObjectId("507f1f77bcf86cd799439011");
      const char2Id = new ObjectId("507f1f77bcf86cd799439012");
      const corporations = [
        {
          _id: new ObjectId(),
          shareholders: [
            { characterId: char1Id, shares: 100 },
            { characterId: char2Id, shares: 50 },
          ],
          sharePrice: 25,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain(corporations));
      mockCollection.mockReturnValueOnce(createMockChain([])); // bonds
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      const result = await snapshotPortfolioValues(100);

      expect(result).toBe(2); // 2 characters
      expect(mockInsertMany).toHaveBeenCalled();
      const insertedDocs = mockInsertMany.mock.calls[0][0];
      expect(insertedDocs).toHaveLength(2);
      expect(insertedDocs.some((d: any) => d.totalValue === 2500)).toBe(true);
      expect(insertedDocs.some((d: any) => d.totalValue === 1250)).toBe(true);
    });

    it("counts index-fund units in the portfolio total", async () => {
      const charId = new ObjectId("507f1f77bcf86cd799439011");
      const fundId = new ObjectId("507f1f77bcf86cd799439021");

      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain([])); // corps
      mockCollection.mockReturnValueOnce(createMockChain([])); // bonds
      mockCollection.mockReturnValueOnce(createMockChain([])); // exchangeRates (loadValuationFxRates)
      mockCollection.mockReturnValueOnce(createMockChain([])); // gameState preset (loadValuationFxRates)
      mockCollection.mockReturnValueOnce(
        createMockChain([{ fundId, holderKind: "character", characterId: charId, units: 10 }])
      );
      mockCollection.mockReturnValueOnce(createMockChain([{ _id: fundId, quotedNav: 125 }]));
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotPortfolioValues(100);

      const insertedDocs = mockInsertMany.mock.calls[0][0];
      const doc = insertedDocs.find((d: any) => d.characterId.toString() === charId.toString());
      // 10 units x 125 NAV, both already in ₳: no conversion.
      expect(doc.fundValue).toBe(1250);
      expect(doc.totalValue).toBe(1250);
      expect(doc.netValue).toBe(1250);
    });

    it("snapshots bond holdings correctly", async () => {
      const charId = new ObjectId("507f1f77bcf86cd799439011");
      const bonds = [
        {
          _id: new ObjectId(),
          holders: [{ characterId: charId, units: 10 }],
          marketPrice: 1.05,
          matured: false,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain([])); // corps
      mockCollection.mockReturnValueOnce(createMockChain(bonds));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotPortfolioValues(100);

      const insertedDocs = mockInsertMany.mock.calls[0][0];
      const expectedValue = 10 * BOND_UNIT_FACE_VALUE * 1.05;
      expect(insertedDocs[0].totalValue).toBe(expectedValue);
    });

    it("aggregates multiple holdings for same character", async () => {
      const charId = new ObjectId("507f1f77bcf86cd799439011");

      const corporations = [
        {
          _id: new ObjectId(),
          shareholders: [{ characterId: charId, shares: 100 }],
          sharePrice: 10,
        },
        {
          _id: new ObjectId(),
          shareholders: [{ characterId: charId, shares: 50 }],
          sharePrice: 20,
        },
      ];

      const bonds = [
        {
          _id: new ObjectId(),
          holders: [{ characterId: charId, units: 5 }],
          marketPrice: 1.0,
          matured: false,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain(corporations));
      mockCollection.mockReturnValueOnce(createMockChain(bonds));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotPortfolioValues(100);

      const insertedDocs = mockInsertMany.mock.calls[0][0];
      // 100 * 10 + 50 * 20 + 5 * BOND_UNIT_FACE_VALUE * 1.0
      const expectedValue = 1000 + 1000 + 5 * BOND_UNIT_FACE_VALUE;
      expect(insertedDocs[0].totalValue).toBe(expectedValue);
    });

    it("snapshots loc debt separately and net value after debt", async () => {
      const charId = new ObjectId("507f1f77bcf86cd799439011");
      const { isForexEnabled } = await import("@/lib/currency/featureFlag");
      vi.mocked(isForexEnabled).mockResolvedValue(true);

      mockCollection.mockReturnValueOnce(createMockChain([{ currencyCode: "USD", rate: 1 }])); // exchangeRates
      mockCollection.mockReturnValueOnce(
        createMockChain([
          {
            _id: charId,
            currencyBalances: {
              personal: { USD: 2_000 },
              savings: { USD: 500 },
            },
            countryId: "US",
            lineOfCredit: {
              balances: { USD: 400 },
              arrears: { USD: 100 },
            },
          },
        ])
      ); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain([])); // corporations
      mockCollection.mockReturnValueOnce(createMockChain([])); // bonds
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotPortfolioValues(100);

      const [doc] = mockInsertMany.mock.calls[0][0];
      expect(doc.cashValue).toBe(2500);
      expect(doc.locDebtValue).toBe(500);
      expect(doc.totalValue).toBe(2500);
      expect(doc.netValue).toBe(2000);
    });

    it("skips matured bonds", async () => {
      const _bonds = [
        {
          _id: new ObjectId(),
          holders: [{ characterId: new ObjectId(), units: 10 }],
          marketPrice: 1.0,
          matured: true,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      // First query returns empty (no corps with shareholders)
      mockCollection.mockReturnValueOnce(createMockChain([]));
      // Second query filters out matured bonds, returns empty
      mockCollection.mockReturnValueOnce(createMockChain([]));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      const result = await snapshotPortfolioValues(100);
      expect(result).toBe(0);
    });

    it("skips bonds with no holders", async () => {
      const bonds = [
        {
          _id: new ObjectId(),
          holders: [],
          marketPrice: 1.0,
          matured: false,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain([]));
      mockCollection.mockReturnValueOnce(createMockChain(bonds));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      const result = await snapshotPortfolioValues(100);
      expect(result).toBe(0);
    });

    it("rounds portfolio values to 2 decimal places", async () => {
      const corporations = [
        {
          _id: new ObjectId(),
          shareholders: [{ characterId: new ObjectId(), shares: 33 }],
          sharePrice: 33.33,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain(corporations));
      mockCollection.mockReturnValueOnce(createMockChain([]));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotPortfolioValues(100);

      const insertedDocs = mockInsertMany.mock.calls[0][0];
      expect(insertedDocs[0].totalValue).toBe(1099.89); // 33 * 33.33
    });

    it("handles multiple characters with mixed holdings", async () => {
      const char1Id = new ObjectId("507f1f77bcf86cd799439011");
      const char2Id = new ObjectId("507f1f77bcf86cd799439012");

      const corporations = [
        {
          _id: new ObjectId(),
          shareholders: [
            { characterId: char1Id, shares: 100 },
            { characterId: char2Id, shares: 50 },
          ],
          sharePrice: 10,
        },
      ];

      const bonds = [
        {
          _id: new ObjectId(),
          holders: [
            { characterId: char1Id, units: 5 },
            { characterId: char2Id, units: 10 },
          ],
          marketPrice: 1.0,
          matured: false,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain(corporations));
      mockCollection.mockReturnValueOnce(createMockChain(bonds));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotPortfolioValues(100);

      const insertedDocs = mockInsertMany.mock.calls[0][0];
      const char1Doc = insertedDocs.find(
        (d: any) => d.characterId.toString() === char1Id.toString()
      );
      const char2Doc = insertedDocs.find(
        (d: any) => d.characterId.toString() === char2Id.toString()
      );

      expect(char1Doc.totalValue).toBe(1000 + 5 * BOND_UNIT_FACE_VALUE);
      expect(char2Doc.totalValue).toBe(500 + 10 * BOND_UNIT_FACE_VALUE);
    });

    it("handles zero share price gracefully", async () => {
      const corporations = [
        {
          _id: new ObjectId(),
          shareholders: [{ characterId: new ObjectId(), shares: 100 }],
          sharePrice: 0,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain(corporations));
      mockCollection.mockReturnValueOnce(createMockChain([]));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotPortfolioValues(100);

      const insertedDocs = mockInsertMany.mock.calls[0][0];
      expect(insertedDocs[0].totalValue).toBe(0);
    });

    it("handles zero bond market price gracefully", async () => {
      const bonds = [
        {
          _id: new ObjectId(),
          holders: [{ characterId: new ObjectId(), units: 10 }],
          marketPrice: 0,
          matured: false,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain([])); // characters
      mockCollection.mockReturnValueOnce(createMockChain([])); // imperialCharacters
      mockCollection.mockReturnValueOnce(createMockChain([]));
      mockCollection.mockReturnValueOnce(createMockChain(bonds));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotPortfolioValues(100);

      const insertedDocs = mockInsertMany.mock.calls[0][0];
      expect(insertedDocs[0].totalValue).toBe(0);
    });
  });

  describe("snapshotCorporationPortfolioValues", () => {
    it("preserves unfilled sale ownership, fund NAV and issued debt in one batched snapshot", async () => {
      const owner = new ObjectId(),
        target = new ObjectId(),
        fund = new ObjectId();
      const rows: Record<string, unknown[]> = {
        corporations: [
          { _id: owner, liquidCapital: 1000, countryId: "US", liquidCurrencyCode: "USD" },
          {
            _id: target,
            liquidCapital: 0,
            sharePrice: 200,
            countryId: "US",
            liquidCurrencyCode: "JPY",
            shareholders: [{ corporationId: owner, shares: 5 }],
          },
        ],
        bonds: [
          {
            _id: new ObjectId(),
            corporationId: owner,
            totalIssued: 100,
            currencyCode: "USD",
            matured: false,
            holders: [],
          },
        ],
        exchangeRates: [
          { currencyCode: "USD", rate: 1 },
          { currencyCode: "JPY", rate: 100 },
        ],
        shareOrders: [
          {
            corporationId: target,
            placerCorporationId: owner,
            type: "sell",
            status: "open",
            sharesRemaining: 20,
          },
        ],
        shareListings: [],
        indexFundPositions: [{ corporationId: owner, fundId: fund, units: 10 }],
        indexFunds: [{ _id: fund, quotedNav: 25, status: "active" }],
      };
      mockCollection.mockImplementation((name: string) => createMockChain(rows[name] ?? []));
      await snapshotCorporationPortfolioValues(100);
      const inserted = mockInsertMany.mock.calls[0][0];
      const doc = inserted.find((d: { corporationId: ObjectId }) => d.corporationId.equals(owner));
      expect(doc).toMatchObject({
        cashValue: 1000,
        stockValue: 50,
        fundValue: 250,
        totalValue: 1300,
        liabilityValue: 100,
        netValue: 1200,
      });
      expect(mockCollection.mock.calls.filter(([name]) => name === "corporations")).toHaveLength(1);
      expect(
        mockCollection.mock.calls.filter(([name]) => name === "indexFundPositions")
      ).toHaveLength(1);
    });

    it("records liquidCapital as cashValue for cash-only corps", async () => {
      const corpId = new ObjectId();
      const allCorps = [{ _id: corpId, liquidCapital: 750_000 }];

      mockCollection.mockReturnValueOnce(createMockChain(allCorps)); // all corps
      mockCollection.mockReturnValueOnce(createMockChain([])); // bonds
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      const result = await snapshotCorporationPortfolioValues(100);

      expect(result).toBe(1);
      const [doc] = mockInsertMany.mock.calls[0][0];
      expect(doc.cashValue).toBe(750_000);
      expect(doc.stockValue).toBe(0);
      expect(doc.bondValue).toBe(0);
      expect(doc.liabilityValue).toBe(0);
      expect(doc.netValue).toBe(750_000);
      expect(doc.totalValue).toBe(750_000);
    });

    it("sums cash + stocks + bonds into totalValue", async () => {
      const holderCorpId = new ObjectId();
      const heldCorpId = new ObjectId();

      const allCorps = [
        { _id: holderCorpId, liquidCapital: 100_000 },
        {
          _id: heldCorpId,
          liquidCapital: 0,
          sharePrice: 50,
          shareholders: [{ corporationId: holderCorpId, shares: 10 }],
        },
      ];
      const bonds = [
        {
          _id: new ObjectId(),
          holders: [{ corporationId: holderCorpId, units: 2 }],
          marketPrice: 1.0,
          matured: false,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain(allCorps));
      mockCollection.mockReturnValueOnce(createMockChain(bonds));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotCorporationPortfolioValues(100);

      const inserted = mockInsertMany.mock.calls[0][0];
      const holderDoc = inserted.find(
        (d: any) => d.corporationId.toString() === holderCorpId.toString()
      );
      expect(holderDoc.cashValue).toBe(100_000);
      expect(holderDoc.stockValue).toBe(500); // 10 * 50
      expect(holderDoc.bondValue).toBe(2 * BOND_UNIT_FACE_VALUE);
      expect(holderDoc.liabilityValue).toBe(0);
      expect(holderDoc.netValue).toBe(100_000 + 500 + 2 * BOND_UNIT_FACE_VALUE);
      expect(holderDoc.totalValue).toBe(100_000 + 500 + 2 * BOND_UNIT_FACE_VALUE);
    });

    it("subtracts issued bond and IMF debt into corporation netValue", async () => {
      const corpId = new ObjectId();

      const allCorps = [
        {
          _id: corpId,
          liquidCapital: 150_000,
          imfBailoutActive: true,
          imfFacilityPrincipalOutstanding: 50_000,
        },
      ];
      const bonds = [
        {
          _id: new ObjectId(),
          corporationId: corpId,
          totalIssued: 200_000,
          holders: [],
          marketPrice: 1,
          matured: false,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain(allCorps));
      mockCollection.mockReturnValueOnce(createMockChain(bonds));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotCorporationPortfolioValues(100);

      const [doc] = mockInsertMany.mock.calls[0][0];
      expect(doc.totalValue).toBe(150_000);
      expect(doc.liabilityValue).toBe(250_000);
      expect(doc.netValue).toBe(-100_000);
    });

    it("includes IMF facility receivables as bond-like assets for the lender", async () => {
      const lenderId = new ObjectId();
      const borrowerId = new ObjectId();

      const allCorps = [
        { _id: lenderId, liquidCapital: 10_000 },
        {
          _id: borrowerId,
          liquidCapital: 0,
          imfBailoutActive: true,
          imfBailoutImfCorporationId: lenderId,
          imfFacilityPrincipalOutstanding: 75_000,
        },
      ];

      mockCollection.mockReturnValueOnce(createMockChain(allCorps));
      mockCollection.mockReturnValueOnce(createMockChain([]));
      // Catch-all: reads that come after the queued ones (index-fund positions)
      // must still answer find/toArray, not only insertMany.
      mockCollection.mockReturnValue({
        ...createMockChain([]),
        insertMany: mockInsertMany,
      });

      await snapshotCorporationPortfolioValues(100);

      const inserted = mockInsertMany.mock.calls[0][0];
      const lenderDoc = inserted.find(
        (d: any) => d.corporationId.toString() === lenderId.toString()
      );
      expect(lenderDoc.cashValue).toBe(10_000);
      expect(lenderDoc.bondValue).toBe(75_000);
      expect(lenderDoc.totalValue).toBe(85_000);
      expect(lenderDoc.netValue).toBe(85_000);
    });
  });
});
