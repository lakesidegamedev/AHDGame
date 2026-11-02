import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  acquireRelocationBondFundingLease,
  hasProtectedRelocationProperty,
  relocationTransitionSectors,
} from "./relocationBondFunding";

const CORP = new ObjectId();

// The optional claim fields must survive an untyped row literal, or the weak-type
// check rejects a plain `{ _id }` sector before the guard ever sees it.
type GuardSector = Pick<
  CorporateSector,
  "_id" | "constructionFinancing" | "constructionPropertyTransition"
>;

function proposed() {
  return {
    operationKey: "hq-bond:corp:US:TX:31",
    targetStateId: "TX",
    targetCountryId: "US" as const,
    turn: 31,
    relocationCostAnchor: 10_000,
    crossCountry: false,
    relocationSpreadAnchor: 0,
    currencyCode: "USD" as const,
    nativeFxRate: 1,
    sourceCountryIdPresent: true,
    sourceCountryId: "US" as const,
    sourceLiquidCurrencyCodePresent: true,
    sourceLiquidCurrencyCode: "USD" as const,
    bondId: new ObjectId(),
    preflight: {
      ok: true,
      cooldownTurnsRemaining: null,
      availableBondCapacity: 50_000,
      existingDebt: 0,
      totalEquity: 100_000,
    },
    ceoVacated: false,
    ceoId: new ObjectId(),
    ceoType: "character" as const,
  };
}

describe("relocation bond publication lease", () => {
  it("allows retry of its own held HQ markers but rejects other holds and claims", () => {
    const lease = proposed();
    const sectorId = new ObjectId();
    const ownMarker = {
      _id: sectorId,
      constructionPropertyTransition: {
        key: `headquarters:${CORP.toHexString()}:US:TX:${sectorId.toHexString()}`,
        kind: "headquarters_relocation",
      },
    };

    expect(hasProtectedRelocationProperty([ownMarker], CORP, lease)).toBe(false);
    expect(hasProtectedRelocationProperty([ownMarker], CORP, undefined)).toBe(true);
    expect(
      hasProtectedRelocationProperty(
        [
          {
            ...ownMarker,
            constructionPropertyTransition: {
              ...ownMarker.constructionPropertyTransition,
              key: "other",
            },
          },
        ],
        CORP,
        lease
      )
    ).toBe(true);
    expect(
      hasProtectedRelocationProperty(
        [
          {
            ...ownMarker,
            constructionFinancing: {
              status: "funding",
              escrowLocal: 0,
            } as never,
          },
        ],
        CORP,
        lease
      )
    ).toBe(true);
  });

  it("lets an in-country move proceed with a financed construction loan still servicing", () => {
    const lease = proposed();
    const sectorId = new ObjectId();
    const claimed = {
      _id: sectorId,
      constructionFinancing: { status: "funding", escrowLocal: 0 } as never,
    };

    expect(hasProtectedRelocationProperty([claimed], CORP, lease)).toBe(true);
    expect(
      hasProtectedRelocationProperty([claimed], CORP, lease, {
        allowFinancedConstructionClaims: true,
      })
    ).toBe(false);
    // The allowance covers the claim, never a hold left by another operation.
    expect(
      hasProtectedRelocationProperty(
        [
          {
            ...claimed,
            constructionPropertyTransition: { key: "other", kind: "headquarters_relocation" },
          },
        ],
        CORP,
        lease,
        { allowFinancedConstructionClaims: true }
      )
    ).toBe(true);
  });

  it("reserves only the sectors the allowed move may hold", () => {
    const claimedId = new ObjectId();
    const claimed = {
      _id: claimedId,
      constructionFinancing: { status: "funding", escrowLocal: 0 } as never,
    };
    const claimedWithOwnMarker = {
      _id: new ObjectId(),
      constructionFinancing: { status: "funding", escrowLocal: 0 } as never,
      constructionPropertyTransition: {
        key: "headquarters:any",
        kind: "headquarters_relocation",
      },
    };
    const free: GuardSector = { _id: new ObjectId() };
    const sectors: GuardSector[] = [claimed, claimedWithOwnMarker, free];

    // A blocked move keeps the old behaviour: every row is offered to the
    // reservation, so its own guard decides.
    expect(relocationTransitionSectors(sectors, false)).toBe(sectors);
    // An allowed move leaves a servicing claim untouched but still cleans up a
    // marker it already owns, and still holds the unclaimed rows.
    expect(relocationTransitionSectors(sectors, true)).toEqual([claimedWithOwnMarker, free]);
  });

  it("reuses the original quote and bond identity after an interrupted publication", async () => {
    const db = createInMemoryDb();
    const frozen = proposed();
    db.seed("corporations", [
      {
        _id: CORP,
        countryId: "US",
        liquidCurrencyCode: "USD",
        ceoId: frozen.ceoId,
        ceoType: frozen.ceoType,
      },
    ]);

    const acquired = await acquireRelocationBondFundingLease(
      db as unknown as Db,
      {
        _id: CORP,
        countryId: "US",
        liquidCurrencyCode: "USD",
      },
      frozen
    );
    const retry = await acquireRelocationBondFundingLease(
      db as unknown as Db,
      { _id: CORP, countryId: "US", liquidCurrencyCode: "USD" },
      { ...proposed(), operationKey: frozen.operationKey }
    );

    expect(acquired).toEqual(frozen);
    expect(retry).toEqual(frozen);
    expect(retry?.bondId).toEqual(frozen.bondId);
    expect(retry?.preflight).toEqual(frozen.preflight);
    expect(db.collection("corporations").docs).toHaveLength(1);
  });

  it("does not acquire when underwriting already holds the corporation cash lease", async () => {
    const db = createInMemoryDb();
    db.seed("corporations", [
      {
        _id: CORP,
        countryId: "US",
        liquidCurrencyCode: "USD",
        bankUnderwritingFunding: { key: "underwriting:fill", turn: 31 },
      },
    ]);

    const result = await acquireRelocationBondFundingLease(
      db as unknown as Db,
      { _id: CORP, countryId: "US", liquidCurrencyCode: "USD" },
      proposed()
    );

    expect(result).toBeNull();
    expect(db.collection("corporations").docs[0].headquartersRelocationBondFunding).toBeUndefined();
  });
});
