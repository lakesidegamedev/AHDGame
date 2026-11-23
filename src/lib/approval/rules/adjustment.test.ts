import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  approvalDeltaUpdate,
  regionalApprovalSnapshot,
  approvalModifiersForDisplay,
} from "./adjustment";
import { applyModifiers } from "@/lib/utils/approvalModifiers";
const bonus = { id: "bonus", label: "Other conditions", effect: 8 };

describe("approval decisions and snapshot consistency", () => {
  it("shares positive cap headroom and refreshes the explanatory event chip", async () => {
    const db = createInMemoryDb();
    db.seed("approval", [
      { _id: "US", approvalRating: 58, approvalRawRating: 58, activeNationalModifiers: [bonus] },
    ]);
    const collection = db.collection("approval");
    await collection.updateOne({ _id: "US" }, approvalDeltaUpdate(5));
    const row = collection.docs[0] as {
      approvalRating: number;
      approvalRawRating: number;
      approvalAdjustment: number;
      activeModifiers: (typeof bonus)[];
      activeNationalModifiers: (typeof bonus)[];
    };
    expect(row.approvalRating).toBe(58);
    expect(row.activeNationalModifiers).toContainEqual(
      expect.objectContaining({ id: "approval_events", effect: 5 })
    );
    expect(applyModifiers(50, row.activeNationalModifiers)).toBe(row.approvalRating);
    await collection.updateOne({ _id: "US" }, approvalDeltaUpdate(-5));
    expect(row.approvalAdjustment).toBe(0);
    expect(row.approvalRating).toBe(58);
    expect(row.activeNationalModifiers).toEqual([bonus]);
  });
  it.each([
    [3, -10],
    [97, 10],
  ])("preserves offsetting regional decisions across snapshots at %s", async (base, delta) => {
    const db = createInMemoryDb();
    db.seed("approval", [
      { _id: "US:TX", approvalRating: base, approvalRawRating: base, activeModifiers: [] },
    ]);
    const collection = db.collection("approval");
    await collection.updateOne({ _id: "US:TX" }, approvalDeltaUpdate(delta));
    const row = collection.docs[0] as {
      approvalRating: number;
      approvalRawRating: number;
      approvalAdjustment: number;
      activeModifiers: (typeof bonus)[];
      activeNationalModifiers: (typeof bonus)[];
    };
    const snapshot = regionalApprovalSnapshot(base, [], row.approvalAdjustment, row);
    Object.assign(row, {
      approvalRating: snapshot.approval,
      approvalRawRating: snapshot.raw,
      activeModifiers: snapshot.modifiers,
    });
    await collection.updateOne({ _id: "US:TX" }, approvalDeltaUpdate(-delta));
    expect(row.approvalRating).toBe(base);
    expect(row.approvalAdjustment).toBe(0);
  });
  it("explains smoothing, positive caps and limits without treating display lines as decisions", () => {
    const result = regionalApprovalSnapshot(50, [{ ...bonus, effect: -25 }], 0, {
      approvalRating: 50,
    });
    expect(result.approval).toBe(48);
    expect(result.modifiers).toContainEqual(
      expect.objectContaining({ id: "approval_smoothing", effect: 23 })
    );
    expect(50 + result.modifiers.reduce((sum, m) => sum + m.effect, 0)).toBe(48);
    expect(approvalModifiersForDisplay(50, result.raw, result.approval, result.modifiers)).toEqual(
      result.modifiers
    );
  });
  it.each([0, 3, 8, 12])(
    "matches snapshot arithmetic throughout a decision sequence with %s other positives",
    async (positive) => {
      const db = createInMemoryDb();
      const modifiers = [
        { ...bonus, effect: positive },
        { id: "negative", label: "Negative", effect: -4 },
      ];
      const raw = 50 + Math.min(8, positive) - 4;
      db.seed("approval", [
        {
          _id: "US",
          approvalRating: raw,
          approvalRawRating: raw,
          activeNationalModifiers: modifiers,
        },
      ]);
      const collection = db.collection("approval");
      for (const delta of [5, 9, -20, 8, -2]) {
        await collection.updateOne({ _id: "US" }, approvalDeltaUpdate(delta));
        const row = collection.docs[0];
        expect(row.approvalRating).toBe(
          applyModifiers(50, row.activeNationalModifiers as typeof modifiers)
        );
      }
    }
  );
});
