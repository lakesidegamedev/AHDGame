import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { controlGroupMemberIds, controlGroupRootByCorpId, groupTotals } from "./controlGroups";

const id = (n: number) => new ObjectId(n.toString(16).padStart(24, "0"));

function corp(self: ObjectId, owner?: { id: ObjectId; shares: number }, total = 100) {
  return {
    _id: self,
    totalShares: total,
    shareholders: owner
      ? [
          { corporationId: owner.id, shares: owner.shares },
          { characterId: id(999), shares: total - owner.shares },
        ]
      : [{ characterId: id(999), shares: total }],
  } as never;
}

describe("control groups for size costs", () => {
  const top = id(1);
  const sub = id(2);
  const subSub = id(3);
  const minority = id(4);
  const corps = [
    corp(top),
    corp(sub, { id: top, shares: 60 }), // unformalized but controlled
    corp(subSub, { id: sub, shares: 51 }),
    corp(minority, { id: top, shares: 40 }), // not controlled
  ];

  it("resolves every corp to its ultimate controller, formalized or not", () => {
    const roots = controlGroupRootByCorpId(corps);
    expect(roots.get(sub.toString())).toBe(top.toString());
    expect(roots.get(subSub.toString())).toBe(top.toString());
    expect(roots.get(minority.toString())).toBe(minority.toString());
  });

  it("gives every member the group total", () => {
    const roots = controlGroupRootByCorpId(corps);
    const plants = new Map([
      [top.toString(), 100],
      [sub.toString(), 200],
      [subSub.toString(), 300],
      [minority.toString(), 50],
    ]);
    const totals = groupTotals(roots, plants);
    expect(totals.get(top.toString())).toBe(600);
    expect(totals.get(subSub.toString())).toBe(600);
    expect(totals.get(minority.toString())).toBe(50);
  });

  it("lists every member of a control group, itself included", () => {
    const roots = controlGroupRootByCorpId(corps);
    expect(controlGroupMemberIds(roots, sub.toString()).sort()).toEqual(
      [top, sub, subSub].map(String).sort()
    );
    expect(controlGroupMemberIds(roots, minority.toString())).toEqual([minority.toString()]);
    expect(controlGroupMemberIds(roots, "unknown")).toEqual(["unknown"]);
  });
});
