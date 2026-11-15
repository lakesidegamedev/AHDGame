import { describe, expect, it } from "vitest";
import { findWorldCopyCollections } from "./opsWorldCopies";

const classified = new Set(["states", "gameState"]);
const isClassified = (n: string) => classified.has(n);

describe("findWorldCopyCollections", () => {
  it("finds snapshots, backups, dated one-offs and rollout records", () => {
    const found = findWorldCopyCollections(
      [
        "recovery_snap_t272_s0to1_prices",
        "recovery_snap_t272_s0to1_sectors",
        "characterGenerals_refund_backup",
        "ariane_relocate_sco_20261002",
        "heal_war_entry_nato4_0830",
        "marketRecoveryLog",
        "economyInterventionRolloutEvents",
        "states",
      ],
      isClassified
    );
    expect(found.map((f) => f.label)).toEqual([
      "recovery and heal snapshots (*_snap_*)",
      "backups (*_backup*)",
      "dated one-off collections (*_YYYYMMDD)",
      "heal one-offs (heal_*)",
      "economy recovery and rollout records",
    ]);
    expect(found[0].names).toHaveLength(2);
  });

  it("ignores manifest collections, system collections and other services' collections", () => {
    expect(
      findWorldCopyCollections(
        ["states", "system.views", "discord_messages", "ops_knowledge", "tracker_items"],
        isClassified
      )
    ).toEqual([]);
  });

  it("never reports a classified collection even when its name matches", () => {
    expect(findWorldCopyCollections(["states_snap_x"], (n) => n === "states_snap_x")).toEqual([]);
  });
});
