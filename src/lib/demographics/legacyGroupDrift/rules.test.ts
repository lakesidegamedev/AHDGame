import { describe, expect, it } from "vitest";
import { US_GROUP_BUCKETS } from "@/lib/countries/us/data/usLegacyGroupBuckets";
import {
  convertGroupDrift,
  projectGroupValues,
  type GroupBucketTable,
  type GroupDriftDoc,
} from "./rules";
import type { Layer1PositionOverlay } from "@/lib/db/types/demographics";

type Axis = "economicLean" | "socialLean";

/** A unit's bucket membership, one weight per bucket of each dimension. */
const UNIT: Record<string, number> = {
  "race:white": 0.7,
  "race:black": 0.2,
  "race:hispanic": 0.1,
  "education:no_college": 0.6,
  "education:college": 0.3,
  "education:graduate": 0.1,
  "age:young": 0.3,
  "age:mid": 0.3,
  "age:mature": 0.2,
  "age:senior": 0.2,
  "wealth:low": 0.4,
  "wealth:middle": 0.4,
  "wealth:high": 0.2,
};

function overlayDelta(overlay: Layer1PositionOverlay | null | undefined, axis: Axis): number {
  let v = 0;
  for (const [dim, byBucket] of Object.entries(overlay ?? {})) {
    for (const [bucket, axes] of Object.entries(byBucket)) {
      v += (UNIT[`${dim}:${bucket}`] ?? 0) * (axes[axis] ?? 0);
    }
  }
  return v;
}

/** The fold older builds ran: group drift projected onto buckets plus the live overlay. */
function olderRead(live: GroupDriftDoc, seeded: GroupDriftDoc, axis: Axis): number {
  const drift: Record<string, number> = {};
  for (const [id, row] of Object.entries(live.groups ?? {})) {
    const base = seeded.groups?.[id];
    if (!base) continue;
    drift[id] = Number(row[axis] ?? 0) - Number(base[axis] ?? 0);
  }
  let v = 0;
  for (const [bucket, delta] of Object.entries(
    projectGroupValues(drift, US_GROUP_BUCKETS).buckets
  )) {
    v += (UNIT[bucket] ?? 0) * delta;
  }
  return v + overlayDelta(live.layer1PositionOverrides, axis);
}

/** The fold this build runs: the live overlay only. */
function currentRead(live: GroupDriftDoc, axis: Axis): number {
  return overlayDelta(live.layer1PositionOverrides, axis);
}

/** Apply a `$set` of dotted paths to a plain copy of the document. */
function applySet(doc: GroupDriftDoc, set: Record<string, unknown>): GroupDriftDoc {
  const out = structuredClone(doc) as Record<string, unknown>;
  for (const [path, value] of Object.entries(set)) {
    const parts = path.split(".");
    let node = out;
    for (const part of parts.slice(0, -1)) {
      node[part] ??= {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = value;
  }
  return out as GroupDriftDoc;
}

const SEEDED: GroupDriftDoc = {
  groups: {
    union_trades: { economicLean: -1, socialLean: 0.5 },
    retirees: { economicLean: 0.4, socialLean: 1.2 },
    evangelicals: { economicLean: 1.1, socialLean: 2.5 },
  },
};

const LIVE: GroupDriftDoc = {
  groups: {
    union_trades: { economicLean: -1.3, socialLean: 0.62 },
    retirees: { economicLean: 0.55, socialLean: 1.2 },
    evangelicals: { economicLean: 1.04, socialLean: 2.71 },
  },
  layer1PositionOverrides: { race: { white: { economicLean: 0.05, socialLean: -0.02 } } },
};

describe("convertGroupDrift", () => {
  it("keeps the electorate the older build read, under both builds", () => {
    const { set } = convertGroupDrift(LIVE, SEEDED, US_GROUP_BUCKETS);
    const converted = applySet(LIVE, set);
    for (const axis of ["economicLean", "socialLean"] as const) {
      const before = olderRead(LIVE, SEEDED, axis);
      expect(before).not.toBeCloseTo(currentRead(LIVE, axis), 6);
      expect(currentRead(converted, axis)).toBeCloseTo(before, 10);
      expect(olderRead(converted, SEEDED, axis)).toBeCloseTo(before, 10);
    }
  });

  it("sets each drifted group row back to its seeded value", () => {
    const { set } = convertGroupDrift(LIVE, SEEDED, US_GROUP_BUCKETS);
    expect(set["groups.union_trades.economicLean"]).toBe(-1);
    expect(set["groups.retirees.economicLean"]).toBe(0.4);
    expect(set).not.toHaveProperty("groups.retirees.socialLean");
  });

  it("finds nothing to do on a converted document", () => {
    const { set } = convertGroupDrift(LIVE, SEEDED, US_GROUP_BUCKETS);
    expect(convertGroupDrift(applySet(LIVE, set), SEEDED, US_GROUP_BUCKETS).set).toEqual({});
  });

  it("does nothing without seeded rows to measure drift from", () => {
    expect(convertGroupDrift(LIVE, null, US_GROUP_BUCKETS).set).toEqual({});
    expect(convertGroupDrift(LIVE, { groups: {} }, US_GROUP_BUCKETS).set).toEqual({});
  });

  it("writes a null overlay whole", () => {
    const live: GroupDriftDoc = {
      groups: { retirees: { economicLean: 0.5, socialLean: 1.2 } },
      layer1PositionOverrides: null,
    };
    const { set } = convertGroupDrift(live, SEEDED, US_GROUP_BUCKETS);
    const overlay = set.layer1PositionOverrides as Layer1PositionOverlay;
    expect(overlay.age.senior.economicLean).toBeCloseTo(0.07, 10);
    expect(overlay.age.mature.economicLean).toBeCloseTo(0.03, 10);
    expect(Object.keys(set).some((k) => k.startsWith("layer1PositionOverrides."))).toBe(false);
  });

  it("writes a null dimension or bucket level whole", () => {
    const table: GroupBucketTable = {
      a: [{ dim: "age", key: "young", w: 1 }],
      b: [{ dim: "race", key: "white", w: 1 }],
    };
    const { set } = convertGroupDrift(
      {
        groups: { a: { economicLean: 1 }, b: { socialLean: 1 } },
        layer1PositionOverrides: { age: null, race: { white: null } } as never,
      },
      { groups: { a: { economicLean: 0 }, b: { socialLean: 0 } } },
      table
    );
    expect(set["layer1PositionOverrides.age"]).toEqual({
      young: { economicLean: 1, socialLean: 0 },
    });
    expect(set["layer1PositionOverrides.race.white"]).toEqual({ economicLean: 0, socialLean: 1 });
  });

  it("reports groups with no mapping and still resets their rows", () => {
    const table: GroupBucketTable = { known: [{ dim: "age", key: "young", w: 1 }] };
    const { set, unmapped } = convertGroupDrift(
      { groups: { known: { economicLean: 1 }, stray: { economicLean: 2 } } },
      { groups: { known: { economicLean: 0 }, stray: { economicLean: 0 } } },
      table
    );
    expect(unmapped).toEqual(["stray"]);
    expect(set["groups.stray.economicLean"]).toBe(0);
    expect(set["layer1PositionOverrides.age.young.economicLean"]).toBe(1);
  });

  it("clamps the overlay to the lean scale and skips keys Mongo cannot address", () => {
    const table: GroupBucketTable = { g: [{ dim: "age", key: "young", w: 1 }] };
    const { set } = convertGroupDrift(
      {
        groups: { g: { economicLean: 9 }, "a.b": { economicLean: 3 }, nil: null as never },
        layer1PositionOverrides: { age: { young: { economicLean: -1, socialLean: 0 } } },
      },
      { groups: { g: { economicLean: 0 }, "a.b": { economicLean: 0 }, nil: { economicLean: 1 } } },
      table
    );
    expect(set["layer1PositionOverrides.age.young.economicLean"]).toBe(5);
    expect(Object.keys(set).sort()).toEqual([
      "groups.g.economicLean",
      "layer1PositionOverrides.age.young.economicLean",
    ]);
  });
});

describe("projectGroupValues", () => {
  it("passes bucket keys through at full weight", () => {
    expect(projectGroupValues({ "age:young": 2 }, {}).buckets).toEqual({ "age:young": 2 });
  });

  it("spreads a US group over its buckets", () => {
    const { buckets } = projectGroupValues({ union_trades: 1 }, US_GROUP_BUCKETS);
    expect(buckets).toEqual({
      "education:no_college": 0.4,
      "wealth:low": 0.35,
      "race:black": 0.25,
    });
  });

  it("gives every US group weights that sum to one", () => {
    for (const weights of Object.values(US_GROUP_BUCKETS)) {
      expect(weights.reduce((s, w) => s + w.w, 0)).toBeCloseTo(1, 10);
    }
  });
});
