import { describe, expect, it } from "vitest";
import { getCollectionCategory, getRuntimeCollectionNames } from "@/lib/admin/seed/seedManifest";
import {
  ECONOMY_RESET_EXTRA_WIPE_COLLECTIONS,
  ECONOMY_RESET_KEEP_COLLECTIONS,
  ECONOMY_RESET_PARTIAL_WIPE_COLLECTIONS,
  ECONOMY_RESET_WIPE_COLLECTIONS,
} from "./collections";

describe("economy-only reset collection contract", () => {
  const wipe = new Set<string>(ECONOMY_RESET_WIPE_COLLECTIONS);
  const partial = new Set(Object.keys(ECONOMY_RESET_PARTIAL_WIPE_COLLECTIONS));
  const keep = new Set(ECONOMY_RESET_KEEP_COLLECTIONS);

  it("classifies every runtime manifest collection as economy-wipe or economy-keep", () => {
    const unclassified = getRuntimeCollectionNames().filter(
      (name) => !wipe.has(name) && !partial.has(name) && !keep.has(name)
    );
    expect(
      unclassified,
      "Add each new runtime collection to the economy reset wipe or keep list"
    ).toEqual([]);
  });

  it("puts each collection in exactly one list", () => {
    const all = [...wipe, ...partial, ...keep];
    expect(all.length).toBe(new Set(all).size);
    expect(ECONOMY_RESET_WIPE_COLLECTIONS.length).toBe(wipe.size);
    expect(ECONOMY_RESET_KEEP_COLLECTIONS.length).toBe(keep.size);
  });

  it("lists only collections the manifest still declares as runtime", () => {
    const runtime = new Set(getRuntimeCollectionNames());
    const stale = [...wipe, ...partial, ...keep].filter((name) => !runtime.has(name));
    expect(stale).toEqual([]);
  });

  it("never wipes the owner keep-list", () => {
    for (const name of [
      "enactedLaws",
      "resetNationalTreasuries",
      "organizationFunds",
      "pensionSchemes",
      "energyPlants",
      "infraProjects",
      "cabinetEstates",
      "militaryUnits",
      "tariffs",
      "subsidies",
      "counters",
      "gameState",
      "sovereignCouponClaims",
      "bondMarketPools",
      "ledgerEntries",
      "balanceSnapshots",
      "financialTxLog",
    ])
      expect(keep.has(name), name).toBe(true);
  });

  it("wipes organized labour with the corporations it organizes", () => {
    // Unions are economy entities keyed to corporateSectors. Keeping them left
    // old treasuries, organizers and heads attached to sectors the reset had
    // rebuilt, so the reset now clears them and reseeds a vacant roster.
    for (const name of ["unions", "unionOrganizers", "unionLeaderVotes", "unionEndorsements"])
      expect(wipe.has(name), name).toBe(true);
  });

  it("clears the producer path latch and the money supply series", () => {
    // loadProducerPath treats any producerEconomyTurns row as a one-way latch,
    // and a kept M2 series would read the cleared private money as a crash.
    for (const name of [
      "producerEconomyTurns",
      "producerOpenings",
      "moneySupplySnapshots",
    ] as const)
      expect(wipe.has(name), name).toBe(true);
  });

  it("keeps extra wipes outside the runtime category", () => {
    for (const name of ECONOMY_RESET_EXTRA_WIPE_COLLECTIONS)
      expect(getCollectionCategory(name)).not.toBe("runtime");
  });
});
