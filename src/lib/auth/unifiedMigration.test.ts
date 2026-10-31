import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isUnifiedMigrationCohort } from "./unifiedMigration";

const CANARY_A = "6a1082556b36a0ff66ae250c";
const CANARY_B = "6a108eec811f9923d77a6ebe";
const GENERAL = "6a1080000000000000000001";
const CANARY_TARGETS = JSON.stringify({
  [CANARY_A]: {
    canonicalAccountId: "12e2ef3f-ba11-4c7a-b7d7-9655b11bf415",
    userId: "a0f5e7e3-0ea6-4567-b581-2e170ed5fec2",
  },
  [CANARY_B]: {
    canonicalAccountId: "9517ea24-5659-4170-ba44-257f86d66c5e",
    userId: "97016ba4-73e5-4f74-9b27-d62c69d09d8e",
  },
});

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ["AHD_UNIFIED_COHORT_TARGETS", "AHD_UNIFIED_GENERAL_COHORT"]) {
    saved.set(key, process.env[key]);
  }
  process.env.AHD_UNIFIED_COHORT_TARGETS = CANARY_TARGETS;
  delete process.env.AHD_UNIFIED_GENERAL_COHORT;
});

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

describe("isUnifiedMigrationCohort", () => {
  it("keeps the exact canary map and adds only explicitly listed general sources", () => {
    expect(isUnifiedMigrationCohort(CANARY_A)).toBe(true);
    expect(isUnifiedMigrationCohort(CANARY_B)).toBe(true);
    expect(isUnifiedMigrationCohort(GENERAL)).toBe(false);

    process.env.AHD_UNIFIED_GENERAL_COHORT = JSON.stringify([GENERAL]);
    expect(isUnifiedMigrationCohort(GENERAL)).toBe(true);
    expect(isUnifiedMigrationCohort("6a1080000000000000000002")).toBe(false);
  });

  it("treats an empty general list as empty, not as an allow-all switch", () => {
    process.env.AHD_UNIFIED_GENERAL_COHORT = "[]";
    expect(isUnifiedMigrationCohort(GENERAL)).toBe(false);
    expect(isUnifiedMigrationCohort(CANARY_A)).toBe(true);
  });

  it("fails closed on malformed, duplicate, oversized or non-hex entries", () => {
    for (const raw of [
      "not-json",
      JSON.stringify([GENERAL, GENERAL]),
      JSON.stringify(["not-an-object-id"]),
      JSON.stringify([CANARY_A, "6A1080000000000000000001"]),
      JSON.stringify(
        Array.from(
          { length: 1001 },
          (_value, index) => `6a1080000000000${String(index).padStart(7, "0")}`
        )
      ),
    ]) {
      process.env.AHD_UNIFIED_GENERAL_COHORT = raw;
      expect(isUnifiedMigrationCohort(GENERAL)).toBe(false);
      expect(isUnifiedMigrationCohort(CANARY_A)).toBe(true);
    }
  });

  it("does not let a malformed canary map disable an explicitly listed general source", () => {
    process.env.AHD_UNIFIED_COHORT_TARGETS = "not-json";
    process.env.AHD_UNIFIED_GENERAL_COHORT = JSON.stringify([GENERAL]);
    expect(isUnifiedMigrationCohort(GENERAL)).toBe(true);
    expect(isUnifiedMigrationCohort(CANARY_A)).toBe(false);
  });
});
