import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { loadMigrationLawPositions } from "./migrationLaws";

function dbWith(programs: object[]) {
  const toArray = vi.fn().mockResolvedValue(programs);
  const find = vi.fn().mockReturnValue({ toArray });
  return { db: { collection: vi.fn().mockReturnValue({ find }) } as unknown as Db, find };
}

describe("loadMigrationLawPositions", () => {
  it("reads enacted national programs and falls back to the 1991 opening choice", async () => {
    const { db, find } = dbWith([
      { country: "JP", familyId: "L49", choice: "far_left" },
      { country: "UK", familyId: "L52", choice: "center_left" },
    ]);
    const positions = await loadMigrationLawPositions(db, "world", ["US", "UK", "JP"]);
    expect(find.mock.calls[0]![0]).toMatchObject({ worldId: "world", scope: "national" });
    expect(positions.get("JP")).toEqual({ entry: "far_left", labour: "center" });
    expect(positions.get("UK")).toEqual({ entry: "center", labour: "center_left" });
    expect(positions.get("US")).toEqual({ entry: "center", labour: "center" });
  });
});
