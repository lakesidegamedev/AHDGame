import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { getPreservedCollectionNames } from "@/lib/admin/seed/seedManifest";
import { PRIMARY_KEY_INDEX_POLICIES } from "../../../../scripts/architecture/collectionIndexCoverage";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { getBucketProfileForRegion } from "../bucketProfile";
import { withLegislativePriorities } from "./profile";
import {
  getPriorityEditorData,
  loadPriorityDefaults,
  loadProfileLegislativePriorities,
} from "./overrides";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

describe("saved electorate priorities on region pages", () => {
  let db: MockDb;
  beforeEach(() => {
    db = createMockDb();
  });

  it("preserves an existing Admin override byte-for-byte when the year-2000 defaults change", async () => {
    const legacy = withLegislativePriorities(
      getBucketProfileForRegion("US", "CA", "1999-default"),
      "US",
      "CA"
    )!;
    const saved = legacy
      .find((s) => s.dim === "age")!
      .buckets.find((b) => b.id === "age:young")!.legislativePriorities!;
    const snapshot = structuredClone(saved);
    const target = { countryId: "US", regionId: "CA", bucketId: "age:young" } as const;
    const world = {
      preset: "1999-default",
      currentYear: 2000,
      startingYear: 1999,
      eraSystemEnabled: true,
    };
    db.collection("gameState").findOne.mockResolvedValue(world);
    db.collection("electoratePriorityOverrides").findOne.mockResolvedValue({
      _id: "US:CA:age:young",
      priorities: saved,
    });
    db.collection("electoratePriorityOverrides").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "US:CA:age:young", priorities: saved }]),
    });
    db.collection("legislationTypes").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(legislationTypes.filter((l) => l.countryScope === "us")),
    });
    const profile = getBucketProfileForRegion("US", "CA", world.preset, null, {
      year: 2000,
      startingYear: 1999,
    })!;
    const result = await loadProfileLegislativePriorities(
      db as unknown as Db,
      profile,
      "US",
      "CA",
      2000
    );
    expect(
      result!.find((s) => s.dim === "age")!.buckets.find((b) => b.id === "age:young")!
        .legislativePriorities
    ).toEqual(saved);
    const editor = await getPriorityEditorData(db as unknown as Db, target);
    expect(editor.priorities).toEqual(saved);
    expect(editor.defaults).not.toEqual(saved);
    expect(editor.defaults).toEqual(
      withLegislativePriorities(profile, "US", "CA", 2000)!
        .find((s) => s.dim === "age")!
        .buckets.find((b) => b.id === "age:young")!.legislativePriorities
    );
    expect(saved).toEqual(snapshot);
    expect(db.collection("electoratePriorityOverrides").replaceOne).not.toHaveBeenCalled();
    expect(db.collection("electoratePriorityOverrides").deleteOne).not.toHaveBeenCalled();
  });

  it("restoration and editor defaults track the live clock and honour the era flag", async () => {
    const target = { countryId: "UK", regionId: "SCO", bucketId: "age:young" } as const;
    const gameState = db.collection("gameState");
    gameState.findOne.mockResolvedValue({
      preset: "1953-default",
      currentYear: 2000,
      startingYear: 1953,
      eraSystemEnabled: true,
    });
    expect((await loadPriorityDefaults(db as unknown as Db, target)).primary.policyOptionId).toBe(
      "uk_tuition_fees_opt_0"
    );
    gameState.findOne.mockResolvedValue({
      preset: "1953-default",
      currentYear: 2000,
      startingYear: 1953,
      eraSystemEnabled: false,
    });
    expect(
      (await loadPriorityDefaults(db as unknown as Db, target)).primary.policyOptionId
    ).not.toBe("uk_tuition_fees_opt_0");
  });

  it("uses durable checkpoint position and turnout overlays for editor/restoration defaults", async () => {
    const target = { countryId: "US", regionId: "CA", bucketId: "age:young" } as const;
    const positions = { age: { young: { economicLean: 10, socialLean: 5 } } };
    const turnout = { age: { young: 20 } };
    db.collection("gameState").findOne.mockResolvedValue({
      preset: "1953-default",
      currentYear: 2000,
      startingYear: 1953,
      eraSystemEnabled: true,
    });
    db.collection("demographicDefaults").findOne.mockResolvedValue({
      layer1PositionOverrides: positions,
      layer1TurnoutOverrides: turnout,
    });
    const profile = getBucketProfileForRegion(
      "US",
      "CA",
      "1953-default",
      null,
      { year: 2000, startingYear: 1953 },
      positions,
      turnout
    );
    const expected = withLegislativePriorities(profile, "US", "CA", 2000)!
      .find((s) => s.dim === "age")!
      .buckets.find((b) => b.id === "age:young")!.legislativePriorities;
    expect(await loadPriorityDefaults(db as unknown as Db, target)).toEqual(expected);
    expect(db.collection("demographicDefaults").findOne).toHaveBeenCalledWith(
      { _id: "CA" },
      { projection: { layer1PositionOverrides: 1, layer1TurnoutOverrides: 1 } }
    );
  });

  it("applies persisted requests to the matching bucket without changing other groups or source data", async () => {
    const profile = getBucketProfileForRegion("US", "CA", "1953-default")!;
    const snapshot = structuredClone(profile);
    const defaultProfile = withLegislativePriorities(profile, "US", "CA")!;
    const priorities = defaultProfile
      .find((s) => s.dim === "age")!
      .buckets.find((b) => b.id === "age:young")!.legislativePriorities!;
    const selection = {
      primary: priorities.secondary[0],
      secondary: [priorities.primary, ...priorities.secondary.slice(1)],
    };
    const overrides = db.collection("electoratePriorityOverrides");
    overrides.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "US:CA:age:young", priorities: selection }]),
    });
    const laws = db.collection("legislationTypes");
    laws.find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue(legislationTypes.filter((law) => law.countryScope === "us")),
    });
    const result = await loadProfileLegislativePriorities(db as unknown as Db, profile, "US", "CA");
    expect(
      result!.find((s) => s.dim === "age")!.buckets.find((b) => b.id === "age:young")!
        .legislativePriorities!.primary
    ).toEqual(priorities.secondary[0]);
    expect(result!.find((s) => s.dim === "race")).toEqual(
      defaultProfile.find((s) => s.dim === "race")
    );
    expect(profile).toEqual(snapshot);
    expect(overrides.find).toHaveBeenCalledTimes(1);
    expect(laws.find).toHaveBeenCalledTimes(1);
    const ids = overrides.find.mock.calls[0][0]._id.$in as string[];
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith("US:CA:"))).toBe(true);
  });

  it("falls back to defaults for a deleted law option and cannot apply another region's override", async () => {
    const profile = getBucketProfileForRegion("US", "CA", "1953-default")!;
    db.collection("electoratePriorityOverrides").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: "US:CA:age:young",
          priorities: {
            primary: { lawTypeId: "removed", policyOptionId: "removed" },
            secondary: [{ lawTypeId: "a" }, { lawTypeId: "b" }, { lawTypeId: "c" }],
          },
        },
        { _id: "US:TX:age:young", priorities: { primary: { lawTypeId: "x" }, secondary: [] } },
      ]),
    });
    expect(
      await loadProfileLegislativePriorities(db as unknown as Db, profile, "US", "CA")
    ).toEqual(withLegislativePriorities(profile, "US", "CA"));
  });

  it("reads overrides once with no catalog query when none exist", async () => {
    await loadProfileLegislativePriorities(
      db as unknown as Db,
      getBucketProfileForRegion("UK", "SCO", "1953-default"),
      "UK",
      "SCO"
    );
    expect(db.collection("electoratePriorityOverrides").find).toHaveBeenCalledTimes(1);
    expect(db.collection("legislationTypes").find).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { primary: null, secondary: [] },
    { primary: {}, secondary: null },
    { primary: {}, secondary: [null, null, null] },
  ])(
    "isolates malformed saved data and keeps the page and editor usable: %j",
    async (priorities) => {
      const profile = getBucketProfileForRegion("US", "CA", "1953-default")!;
      const collection = db.collection("electoratePriorityOverrides");
      collection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ _id: "US:CA:age:young", priorities }]),
      });
      collection.findOne.mockResolvedValue({ _id: "US:CA:age:young", priorities });
      expect(
        await loadProfileLegislativePriorities(db as unknown as Db, profile, "US", "CA")
      ).toEqual(withLegislativePriorities(profile, "US", "CA"));
      const editor = await getPriorityEditorData(db as unknown as Db, {
        countryId: "US",
        regionId: "CA",
        bucketId: "age:young",
      });
      expect(editor.invalidOverride).toBe(true);
      expect(editor.isOverride).toBe(true);
      expect(editor.priorities.primary.lawName).toBeTruthy();
    }
  );

  it("does no database work for absent profiles or unsupported countries", async () => {
    expect(
      await loadProfileLegislativePriorities(db as unknown as Db, null, "US", "CA")
    ).toBeNull();
    await loadProfileLegislativePriorities(
      db as unknown as Db,
      getBucketProfileForRegion("DE", "BE", "1953-default"),
      "DE",
      "BE"
    );
    expect(db.collection).not.toHaveBeenCalled();
  });

  it("preserves authored overrides during reset and declares primary-key-only access", () => {
    expect(getPreservedCollectionNames()).toContain("electoratePriorityOverrides");
    expect(PRIMARY_KEY_INDEX_POLICIES.electoratePriorityOverrides).toContain("_id");
  });
});
