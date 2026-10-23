import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { buildGroupDominanceShares } from "./groupDominanceShares";

const corpA = new ObjectId();
const corpB = new ObjectId();
const corpC = new ObjectId();
const sec = (corp: ObjectId, stateId = "s1", sectorType = "mining") =>
  ({
    _id: new ObjectId(),
    corporationId: corp,
    stateId,
    countryId: "US",
    sectorType,
    industryModel: null,
    mediaDiscriminator: null,
  }) as never;

describe("buildGroupDominanceShares", () => {
  it("adds subsidiaries' shares in one cell and leaves other groups alone", () => {
    const a = sec(corpA);
    const b = sec(corpB);
    const c = sec(corpC);
    const roots = new Map([
      [corpA.toString(), "g"],
      [corpB.toString(), "g"],
      [corpC.toString(), corpC.toString()],
    ]);
    const local = new Map([
      [(a as { _id: ObjectId })._id.toString(), 30],
      [(b as { _id: ObjectId })._id.toString(), 25],
      [(c as { _id: ObjectId })._id.toString(), 10],
    ]);
    const out = buildGroupDominanceShares({
      sectors: [a, b, c],
      rootByCorpId: roots,
      localShareBySectorId: local,
      nationalShareBySectorId: local,
      countryOf: () => "US",
    });
    expect(out.local.get((a as { _id: ObjectId })._id.toString())).toBe(55);
    expect(out.local.get((b as { _id: ObjectId })._id.toString())).toBe(55);
    expect(out.local.get((c as { _id: ObjectId })._id.toString())).toBe(10);
    expect(out.national.get((a as { _id: ObjectId })._id.toString())).toBe(55);
  });

  it("counts a corporation's national share once however many sectors it has", () => {
    const a1 = sec(corpA, "s1");
    const a2 = sec(corpA, "s2");
    const id = (s: unknown) => (s as { _id: ObjectId })._id.toString();
    const national = new Map([
      [id(a1), 40],
      [id(a2), 40],
    ]);
    const out = buildGroupDominanceShares({
      sectors: [a1, a2],
      rootByCorpId: new Map(),
      localShareBySectorId: new Map(),
      nationalShareBySectorId: national,
      countryOf: () => "US",
    });
    expect(out.national.get(id(a1))).toBe(40);
  });

  it("caps at 100", () => {
    const a = sec(corpA);
    const b = sec(corpB);
    const id = (s: unknown) => (s as { _id: ObjectId })._id.toString();
    const out = buildGroupDominanceShares({
      sectors: [a, b],
      rootByCorpId: new Map([
        [corpA.toString(), "g"],
        [corpB.toString(), "g"],
      ]),
      localShareBySectorId: new Map([
        [id(a), 70],
        [id(b), 60],
      ]),
      nationalShareBySectorId: new Map(),
      countryOf: () => "US",
    });
    expect(out.local.get(id(a))).toBe(100);
  });
});
