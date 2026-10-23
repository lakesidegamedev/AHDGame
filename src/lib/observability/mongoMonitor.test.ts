import { describe, expect, it } from "vitest";
import {
  collectionFromCommand,
  mongoMonitorWanted,
  writeCommandInfo,
  writeReplyCount,
} from "./mongoMonitor";

/**
 * Collection attribution drives both the Sentry `db` breadcrumbs and the
 * per-phase round-trip profiler. Getting it wrong on `getMore` sent every
 * paginated batch to "unknown", which is most of the documents a turn reads:
 * large result sets are precisely the ones that paginate.
 */
describe("collectionFromCommand", () => {
  it("reads the collection from the command's own value", () => {
    expect(collectionFromCommand("find", { find: "corporations" })).toBe("corporations");
    expect(collectionFromCommand("aggregate", { aggregate: "ledgerEntries" })).toBe(
      "ledgerEntries"
    );
    expect(collectionFromCommand("update", { update: "npps" })).toBe("npps");
  });

  it("reads getMore's collection from its separate field, not the cursor id", () => {
    // The driver sends `{ getMore: <Long cursorId>, collection: "name" }`.
    // The id's exact type does not matter here, only that it is not a string.
    expect(
      collectionFromCommand("getMore", {
        getMore: { _bsontype: "Long" },
        collection: "ledgerEntries",
      })
    ).toBe("ledgerEntries");
  });

  it("falls back to the collection field for any command with a non-string value", () => {
    expect(collectionFromCommand("weird", { weird: 42, collection: "corporations" })).toBe(
      "corporations"
    );
  });

  it("reports unknown when neither is available", () => {
    expect(collectionFromCommand("ping", {})).toBe("unknown");
    expect(collectionFromCommand("getMore", { getMore: { _bsontype: "Long" } })).toBe("unknown");
    expect(collectionFromCommand("find", { find: 1, collection: 2 })).toBe("unknown");
  });
});

describe("mongoMonitorWanted", () => {
  it("instruments hosted processes by default", () => {
    expect(mongoMonitorWanted({})).toBe(true);
  });

  it("honours the explicit opt-out", () => {
    expect(mongoMonitorWanted({ OBSERVABILITY_DB_MONITOR: "false" })).toBe(false);
  });

  it("stays off the singleplayer critical path", () => {
    expect(mongoMonitorWanted({ SINGLEPLAYER: "1" })).toBe(false);
  });
});

/**
 * Write accounting is what turns "this phase issued 900 commands" into "this
 * phase wrote 52000 documents into a fifteen-index collection". The command is
 * seen on started, the real count only exists on the reply, so the two halves
 * are tested together.
 */
describe("writeCommandInfo", () => {
  it("counts inserted documents and their payload when BSON accounting is on", () => {
    const command = {
      insert: "financialTxLog",
      documents: [
        { type: "bond_coupon", amount: 1 },
        { type: "bond_coupon", amount: 2 },
      ],
    };
    expect(writeCommandInfo("insert", command)).toEqual({ statements: 2, bytes: 0 });
    const sized = writeCommandInfo("insert", command, true)!;
    expect(sized.statements).toBe(2);
    expect(sized.bytes).toBeGreaterThan(0);
  });

  it("counts update and delete statements without sizing them", () => {
    expect(
      writeCommandInfo("update", {
        update: "corporations",
        updates: [{ q: {} }, { q: {} }, { q: {} }],
      })
    ).toEqual({ statements: 3, bytes: 0 });
    expect(
      writeCommandInfo("delete", { delete: "shareOrders", deletes: [{ q: {} }, { q: {} }] })
    ).toEqual({ statements: 2, bytes: 0 });
  });

  it("treats findAndModify as a single write", () => {
    expect(writeCommandInfo("findAndModify", { findAndModify: "gameState" })).toEqual({
      statements: 1,
      bytes: 0,
    });
  });

  it("ignores reads", () => {
    expect(writeCommandInfo("find", { find: "npps" })).toBeUndefined();
    expect(writeCommandInfo("aggregate", { aggregate: "ledgerEntries" })).toBeUndefined();
    expect(writeCommandInfo("getMore", { getMore: 1 })).toBeUndefined();
  });
});

describe("writeReplyCount", () => {
  it("uses the server's inserted count", () => {
    expect(writeReplyCount("insert", { n: 2 }, 2)).toBe(2);
    expect(writeReplyCount("insert", {}, 2)).toBe(2);
  });

  it("counts modified documents plus upserts, not matched-but-unchanged ones", () => {
    expect(writeReplyCount("update", { n: 5, nModified: 3 }, 5)).toBe(3);
    expect(writeReplyCount("update", { n: 5, nModified: 3, upserted: [{ _id: 1 }] }, 5)).toBe(4);
    expect(writeReplyCount("update", { n: 5, nModified: 0 }, 5)).toBe(0);
  });

  it("uses the deleted count, and only counts a findAndModify that returned a document", () => {
    expect(writeReplyCount("delete", { n: 7 }, 0)).toBe(7);
    expect(writeReplyCount("findAndModify", { value: { _id: "current" } }, 1)).toBe(1);
    expect(writeReplyCount("findAndModify", { value: null }, 1)).toBe(0);
  });
});
