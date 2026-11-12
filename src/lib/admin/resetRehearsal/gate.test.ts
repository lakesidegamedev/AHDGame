import { describe, expect, it } from "vitest";
import {
  REHEARSAL_RECORD_MAX_AGE_MS,
  evaluateRehearsalRecord,
  settingsFingerprint,
  type ResetSettings,
} from "./gate";

const settings: ResetSettings = {
  preset: "2027-default",
  mode: "historical",
  startingParties: "default",
  foundingPhase: false,
};
const NOW = Date.parse("2026-11-12T12:00:00Z");
const context = {
  settingsFingerprint: settingsFingerprint(settings),
  treeHash: "tree-a",
  nowMs: NOW,
};
const good = {
  passed: true,
  timestamp: new Date(NOW - 60_000).toISOString(),
  settingsFingerprint: settingsFingerprint(settings),
  treeHash: "tree-a",
};

describe("settingsFingerprint", () => {
  it("is stable and changes with every setting", () => {
    expect(settingsFingerprint({ ...settings })).toBe(settingsFingerprint(settings));
    for (const changed of [
      { preset: "2026-default" },
      { mode: "vacant" },
      { startingParties: "none" as const },
      { foundingPhase: true },
    ])
      expect(settingsFingerprint({ ...settings, ...changed })).not.toBe(
        settingsFingerprint(settings)
      );
  });
});

describe("evaluateRehearsalRecord", () => {
  it("accepts a fresh passing record for the same settings and tree", () => {
    expect(evaluateRehearsalRecord(good, context)).toEqual({ ok: true });
  });
  it("refuses a missing record", () => {
    expect(evaluateRehearsalRecord(null, context)).toMatchObject({ ok: false, reason: "missing" });
  });
  it("refuses a failed record", () => {
    expect(evaluateRehearsalRecord({ ...good, passed: false }, context)).toMatchObject({
      reason: "failed",
    });
  });
  it("refuses a stale record and one dated in the future", () => {
    const old = new Date(NOW - REHEARSAL_RECORD_MAX_AGE_MS - 1).toISOString();
    expect(evaluateRehearsalRecord({ ...good, timestamp: old }, context)).toMatchObject({
      reason: "stale",
    });
    const future = new Date(NOW + 60_000).toISOString();
    expect(evaluateRehearsalRecord({ ...good, timestamp: future }, context)).toMatchObject({
      reason: "stale",
    });
  });
  it("accepts a record just inside the age limit", () => {
    const edge = new Date(NOW - REHEARSAL_RECORD_MAX_AGE_MS).toISOString();
    expect(evaluateRehearsalRecord({ ...good, timestamp: edge }, context)).toEqual({ ok: true });
  });
  it("refuses different settings", () => {
    const other = settingsFingerprint({ ...settings, startingParties: "none" });
    expect(evaluateRehearsalRecord({ ...good, settingsFingerprint: other }, context)).toMatchObject(
      { reason: "settings-differ" }
    );
  });
  it("refuses a different tree but ignores the commit sha", () => {
    expect(evaluateRehearsalRecord({ ...good, treeHash: "tree-b" }, context)).toMatchObject({
      reason: "tree-differs",
    });
    expect(evaluateRehearsalRecord({ ...good, head: "another-sha" } as never, context)).toEqual({
      ok: true,
    });
  });
  it("never matches when the tree hash could not be read", () => {
    expect(
      evaluateRehearsalRecord({ ...good, treeHash: "unknown" }, { ...context, treeHash: "unknown" })
    ).toMatchObject({ reason: "tree-differs" });
  });
  it("refuses a record with no tree hash or timestamp", () => {
    expect(evaluateRehearsalRecord({ ...good, treeHash: undefined }, context)).toMatchObject({
      reason: "tree-differs",
    });
    expect(evaluateRehearsalRecord({ ...good, timestamp: undefined }, context)).toMatchObject({
      reason: "unreadable",
    });
  });
});
