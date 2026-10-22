import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureIndexMock } = vi.hoisted(() => ({ ensureIndexMock: vi.fn() }));

vi.mock("./helpers", () => ({ ensureIndex: ensureIndexMock }));

import { seedPerfIndexes } from "./performance";

describe("seedPerfIndexes", () => {
  beforeEach(() => ensureIndexMock.mockReset());

  it("supports iteration-scoped successful clock repair without a blocking sort", async () => {
    const db = { collection: vi.fn() } as unknown as Db;
    await seedPerfIndexes(db, () => {});
    expect(ensureIndexMock).toHaveBeenCalledWith(
      db,
      "turnLogs",
      {
        success: 1,
        "iteration.type": 1,
        "iteration.number": 1,
        turn: -1,
        gameTime: -1,
      },
      expect.any(Object),
      expect.any(Function)
    );
  });

  /**
   * `manifestos` shipped with no index beyond `_id`, so every read — the point
   * lookup on save/lock and the batch `$in` behind the elections page — was a
   * collection scan. The elections page issues one of those per contested race.
   */
  it("indexes the manifestos lookup key so the elections page stops scanning", async () => {
    const db = { collection: vi.fn() } as unknown as Db;
    await seedPerfIndexes(db, () => {});

    const call = ensureIndexMock.mock.calls.find((c) => c[1] === "manifestos");
    expect(call, "no manifestos index is seeded").toBeTruthy();
    expect(call![2]).toEqual({ countryId: 1, electionId: 1, party: 1 });
  });

  /**
   * `electedOfficials` carried indexes on characterId, nppId and a text index,
   * but nothing on `party`. The party growth frontier asks "which regions hold
   * an office for this party" on every party hub load, every recruitment and
   * relocation picker, and every join or recruit attempt, so without this each
   * of those is a full collection scan.
   */
  it("indexes electedOfficials by party and region for the growth frontier", async () => {
    const db = { collection: vi.fn() } as unknown as Db;
    await seedPerfIndexes(db, () => {});

    const call = ensureIndexMock.mock.calls.find(
      (c) => c[1] === "electedOfficials" && c[3]?.name === "electedOfficials_party_state"
    );
    expect(call, "no electedOfficials party/state index is seeded").toBeTruthy();
    expect(call![2]).toEqual({ party: 1, state: 1 });
  });

  /**
   * Every regional surface — the region page, the governor's office, the state
   * legislature and its API — filters seats by `state` (usually with countryId)
   * and sorts by office. `{ party, state }` cannot serve a state-only equality,
   * so each of those was a collection scan plus an in-memory sort over every
   * federal, state and local seat in every country. /world tallies seats by
   * country, which the second index covers.
   */
  it("indexes electedOfficials by state and by country chamber roster", async () => {
    const db = { collection: vi.fn() } as unknown as Db;
    await seedPerfIndexes(db, () => {});

    const stateCall = ensureIndexMock.mock.calls.find(
      (c) => c[3]?.name === "electedOfficials_state_countryId_officeType"
    );
    expect(stateCall, "no electedOfficials state index is seeded").toBeTruthy();
    expect(stateCall![2]).toEqual({ state: 1, countryId: 1, officeType: 1 });

    const chamberCall = ensureIndexMock.mock.calls.find(
      (c) => c[3]?.name === "electedOfficials_countryId_officeType"
    );
    expect(chamberCall, "no electedOfficials country/chamber index is seeded").toBeTruthy();
    expect(chamberCall![2]).toEqual({ countryId: 1, officeType: 1 });
  });

  /**
   * Subsidiary-group pages reconstruct effective ownership from every open
   * CORPORATE sell order and listing in the world — no corporationId predicate —
   * which was a collection scan over the whole order history.
   */
  it("indexes world-level corporate share sells for the group pages", async () => {
    const db = { collection: vi.fn() } as unknown as Db;
    await seedPerfIndexes(db, () => {});

    const orderCall = ensureIndexMock.mock.calls.find(
      (c) => c[3]?.name === "shareOrders_type_status_placerCorp"
    );
    expect(orderCall, "no world-level corporate sell index is seeded").toBeTruthy();
    expect(orderCall![2]).toEqual({ type: 1, status: 1, placerCorporationId: 1 });

    const listingCall = ensureIndexMock.mock.calls.find(
      (c) => c[3]?.name === "shareListings_status_sellerCorp"
    );
    expect(listingCall, "no world-level corporate listing index is seeded").toBeTruthy();
    expect(listingCall![2]).toEqual({ status: 1, sellerCorporationId: 1 });
  });

  it("recreates election result snapshot indexes after a world reset", async () => {
    const db = { collection: vi.fn() } as unknown as Db;
    await seedPerfIndexes(db, () => {});

    const calls = ensureIndexMock.mock.calls.filter((c) => c[1] === "electionResultSnapshots");
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          db,
          "electionResultSnapshots",
          { electionId: 1 },
          { unique: true, name: "election_result_snapshot_election" },
        ]),
        expect.arrayContaining([
          db,
          "electionResultSnapshots",
          { countryId: 1, electionType: 1, cycle: -1 },
          { name: "election_result_snapshot_history" },
        ]),
      ])
    );
  });

  it("indexes federal budget snapshots for country history in turn order", async () => {
    const db = { collection: vi.fn() } as unknown as Db;
    await seedPerfIndexes(db, () => {});

    const call = ensureIndexMock.mock.calls.find((c) => c[1] === "federalBudgetSnapshots");
    expect(call, "no federal budget history index is seeded").toBeTruthy();
    expect(call![2]).toEqual({ countryId: 1, turn: -1 });
    expect(call![3]).toMatchObject({ name: "federalBudgetSnapshots_country_turn" });
  });
});
