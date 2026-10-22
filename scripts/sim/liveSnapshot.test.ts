import { describe, expect, it } from "vitest";
import { resolveLiveSnapshotDb } from "./liveSnapshot";

describe("resolveLiveSnapshotDb", () => {
  it("returns the active snapshot database", () => {
    expect(resolveLiveSnapshotDb({ _id: "current", dbName: "live-snapshot-a" })).toBe(
      "live-snapshot-a"
    );
    expect(
      resolveLiveSnapshotDb({ _id: "current", dbName: "live-snapshot-b", swapping: false })
    ).toBe("live-snapshot-b");
  });

  it("refuses when no snapshot is recorded", () => {
    expect(() => resolveLiveSnapshotDb(null)).toThrow(/no live snapshot is recorded/);
    expect(() => resolveLiveSnapshotDb({ _id: "current" })).toThrow(/no live snapshot is recorded/);
  });

  it("refuses while a refresh is in progress", () => {
    expect(() =>
      resolveLiveSnapshotDb({ _id: "current", dbName: "live-snapshot-a", swapping: true })
    ).toThrow(/being refreshed/);
  });

  it("refuses any other database, including the production game db", () => {
    for (const dbName of ["a-house-divided", "live-snapshot", "live-snapshot-c", "sim_control"]) {
      expect(() => resolveLiveSnapshotDb({ _id: "current", dbName })).toThrow(
        /not live-snapshot-a or live-snapshot-b/
      );
    }
  });
});
