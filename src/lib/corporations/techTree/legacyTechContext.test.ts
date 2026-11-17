import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { loadLegacyTechContext, loadLegacyTechMode } from "./legacyTechContext";

describe("loadLegacyTechMode", () => {
  it("is off when gameConfig has no legacyTechMode", async () => {
    const db = createInMemoryDb();
    db.seed("gameConfig", [{ _id: "default" }]);
    expect(await loadLegacyTechMode(db as never)).toBe("off");
  });

  it("is off with no gameConfig document at all", async () => {
    const db = createInMemoryDb();
    expect(await loadLegacyTechMode(db as never)).toBe("off");
  });

  it("reads baseline, and treats any other value as off", async () => {
    const db = createInMemoryDb();
    db.seed("gameConfig", [{ _id: "default", legacyTechMode: "baseline" }]);
    expect(await loadLegacyTechMode(db as never)).toBe("baseline");
    const other = createInMemoryDb();
    other.seed("gameConfig", [{ _id: "default", legacyTechMode: "phaseOut" }]);
    expect(await loadLegacyTechMode(other as never)).toBe("off");
  });
});

describe("loadLegacyTechContext", () => {
  it("pairs the stored mode with the world's starting year", async () => {
    const db = createInMemoryDb();
    db.seed("gameConfig", [{ _id: "default", legacyTechMode: "baseline" }]);
    db.seed("gameState", [{ _id: "current", startingYear: 2027 }]);
    expect(await loadLegacyTechContext(db as never)).toEqual({
      startingYear: 2027,
      mode: "baseline",
    });
  });

  it("uses a starting year the caller already has", async () => {
    const db = createInMemoryDb();
    expect(await loadLegacyTechContext(db as never, { startingYear: 1991 })).toEqual({
      startingYear: 1991,
      mode: "off",
    });
  });
});
