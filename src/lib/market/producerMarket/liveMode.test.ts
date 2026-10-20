import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { Db } from "mongodb";
import {
  assertLegacyProducerPathClaim,
  claimProducerPath,
  loadProducerPath,
  resolveProducerPath,
} from "./liveMode";

const opening = { worldEpoch: "w", turn: 99, digest: "d" };

describe("producer path", () => {
  it("stays legacy until the configured turn", () => {
    expect(
      resolveProducerPath({ turn: 99, worldEpoch: "w", liveFromTurn: 100, opening, latched: false })
    ).toBe("legacy");
    expect(
      resolveProducerPath({
        turn: 99,
        worldEpoch: "w",
        liveFromTurn: undefined,
        opening: null,
        latched: false,
      })
    ).toBe("legacy");
  });

  it("goes funded at the configured turn only with the opening marker on the turn before", () => {
    expect(
      resolveProducerPath({
        turn: 100,
        worldEpoch: "w",
        liveFromTurn: 100,
        opening,
        latched: false,
      })
    ).toBe("funded");
    expect(() =>
      resolveProducerPath({
        turn: 100,
        worldEpoch: "w",
        liveFromTurn: 100,
        opening: null,
        latched: false,
      })
    ).toThrow(/opening conversion/);
    expect(() =>
      resolveProducerPath({
        turn: 100,
        worldEpoch: "w",
        liveFromTurn: 100,
        opening: { ...opening, worldEpoch: "v" },
        latched: false,
      })
    ).toThrow(/opening conversion/);
  });

  it("never returns to legacy once a funded turn ran", () => {
    expect(
      resolveProducerPath({ turn: 140, worldEpoch: "w", liveFromTurn: 100, opening, latched: true })
    ).toBe("funded");
    expect(() =>
      resolveProducerPath({
        turn: 140,
        worldEpoch: "w",
        liveFromTurn: undefined,
        opening,
        latched: true,
      })
    ).toThrow(/cannot return to legacy/);
  });

  it("loads the latch from recorded producer turns", async () => {
    const memory = createInMemoryDb();
    const db = memory as unknown as Db;
    memory.seed("gameState", [{ _id: "current", producerOpening: opening }]);
    expect(await loadProducerPath(db, { turn: 100, worldEpoch: "w", liveFromTurn: 100 })).toBe(
      "funded"
    );
    memory.seed("producerEconomyTurns", [{ _id: "x", worldEpoch: "w", turn: 100 }]);
    await expect(
      loadProducerPath(db, { turn: 101, worldEpoch: "w", liveFromTurn: null })
    ).rejects.toThrow(/cannot return to legacy/);
  });

  it("lets a turn claim one path, refuses a second, and blocks legacy prices on a funded turn", async () => {
    const memory = createInMemoryDb();
    const db = memory as unknown as Db;
    await claimProducerPath(db, { worldEpoch: "w", turn: 5, path: "legacy", phase: "a" });
    await claimProducerPath(db, { worldEpoch: "w", turn: 5, path: "legacy", phase: "retry" });
    await expect(
      claimProducerPath(db, { worldEpoch: "w", turn: 5, path: "funded", phase: "b" })
    ).rejects.toThrow(/already runs the legacy/);
    await assertLegacyProducerPathClaim(db, "w", 5);
    await claimProducerPath(db, { worldEpoch: "w", turn: 6, path: "funded", phase: "c" });
    await expect(assertLegacyProducerPathClaim(db, "w", 6)).rejects.toThrow(/legacy prices/);
  });
});
