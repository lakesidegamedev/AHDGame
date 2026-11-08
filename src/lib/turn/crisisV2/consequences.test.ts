import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { MAX_PARTY_ELECTION_PCT } from "@/lib/crises/v2/blame";
import type { AccountabilityEntry } from "@/lib/crises/v2/types";
import { settleCrisisConsequences } from "./consequences";

const idle = (
  holderId: string,
  role: AccountabilityEntry["role"],
  turns = 8
): AccountabilityEntry[] =>
  Array.from({ length: turns }, (_, turn) => ({
    turn,
    stage: "peak" as const,
    role,
    holderId,
    leverId: null,
    cost: {},
    mitigation: 0,
    severity: 90,
  }));

const acted = (holderId: string, role: AccountabilityEntry["role"]): AccountabilityEntry[] =>
  Array.from({ length: 5 }, (_, turn) => ({
    turn,
    stage: "peak" as const,
    role,
    holderId,
    leverId: "lever",
    cost: {},
    mitigation: 4,
    severity: 85,
  }));

function makeDb(characters: Record<string, unknown>[]) {
  const approvalUpdates: { filter: unknown; update: unknown }[] = [];
  const stateUpdates: { filter: unknown; update: unknown }[] = [];
  const modifierWrites = vi.fn(async () => ({}));
  const db = {
    collection(name: string) {
      if (name === "characters") return { find: () => ({ toArray: async () => characters }) };
      if (name === "governmentApprovals" || name === "stateApprovalHistory") {
        const sink = name === "governmentApprovals" ? approvalUpdates : stateUpdates;
        return {
          bulkWrite: async (ops: { updateOne: { filter: unknown; update: unknown } }[]) =>
            void ops.forEach((op) => sink.push(op.updateOne)),
        };
      }
      if (name === "countryModifiers") return { bulkWrite: modifierWrites };
      throw new Error(`unexpected ${name}`);
    },
  };
  return { db: db as never, approvalUpdates, stateUpdates, modifierWrites };
}

const targets = (regionIds: string[] = []) => ({
  crisisId: new ObjectId(),
  scope: regionIds.length > 0 ? ("state" as const) : ("national" as const),
  regionIds,
});

describe("settleCrisisConsequences", () => {
  it("docks a head of state who sat on their levers and shifts their party's vote", async () => {
    const president = new ObjectId();
    const { db, approvalUpdates, modifierWrites } = makeDb([
      { _id: president, countryId: "US", party: "red" },
    ]);
    const result = await settleCrisisConsequences(
      db,
      { ledger: idle(president.toString(), "headOfState") },
      targets(),
      40
    );
    expect(result).toEqual({ approvalWrites: 1, electionShifts: 1 });
    expect(approvalUpdates[0].filter).toEqual({ _id: "US" });
    const delta = JSON.stringify(approvalUpdates[0].update);
    expect(delta).toContain("-");
    const ops = (modifierWrites.mock.calls[0] as unknown as [unknown[]])[0] as {
      updateOne: {
        update: {
          $setOnInsert: {
            pct: number;
            partyId: string;
            expiresAtTurn: number;
            regionIds: string[];
          };
        };
      };
    }[];
    const doc = ops[0].updateOne.update.$setOnInsert;
    expect(doc.partyId).toBe("red");
    expect(doc.pct).toBeLessThan(0);
    expect(Math.abs(doc.pct)).toBeLessThanOrEqual(MAX_PARTY_ELECTION_PCT);
    expect(doc.expiresAtTurn).toBe(88);
    expect(doc.regionIds).toEqual([]);
  });

  it("credits a governor who acted, on their state approval, with the shift limited to the crisis regions", async () => {
    const governor = new ObjectId();
    const { db, stateUpdates, approvalUpdates, modifierWrites } = makeDb([
      {
        _id: governor,
        countryId: "US",
        party: "blue",
        currentOffice: { type: "governor", state: "tx" },
      },
    ]);
    await settleCrisisConsequences(
      db,
      { ledger: acted(governor.toString(), "stateGovernor") },
      targets(["TX"]),
      40
    );
    expect(approvalUpdates).toHaveLength(0);
    expect(stateUpdates[0].filter).toEqual({ _id: "TX", countryId: "US" });
    const ops = (modifierWrites.mock.calls[0] as unknown as [unknown[]])[0] as {
      updateOne: { update: { $setOnInsert: { pct: number; regionIds: string[] } } };
    }[];
    expect(ops[0].updateOne.update.$setOnInsert.pct).toBeGreaterThan(0);
    expect(ops[0].updateOne.update.$setOnInsert.regionIds).toEqual(["TX"]);
  });

  it("moves votes but not approval for roles that carry no approval figure", async () => {
    const leader = new ObjectId();
    const { db, approvalUpdates, stateUpdates, modifierWrites } = makeDb([
      { _id: leader, countryId: "US", party: "red" },
    ]);
    await settleCrisisConsequences(
      db,
      { ledger: idle(leader.toString(), "partyLeader") },
      targets(),
      40
    );
    expect(approvalUpdates).toHaveLength(0);
    expect(stateUpdates).toHaveLength(0);
    expect(modifierWrites).toHaveBeenCalledTimes(1);
  });

  it("writes nothing for a ledger with no one to judge", async () => {
    const { db, modifierWrites } = makeDb([]);
    expect(await settleCrisisConsequences(db, { ledger: [] }, targets(), 40)).toEqual({
      approvalWrites: 0,
      electionShifts: 0,
    });
    expect(modifierWrites).not.toHaveBeenCalled();
  });

  it("bounds a party's total when several of its holders were blamed", async () => {
    const ids = [new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId()];
    const { db, modifierWrites } = makeDb(
      ids.map((_id) => ({ _id, countryId: "US", party: "red" }))
    );
    const roles = ["headOfState", "legislature", "partyLeader", "legislature"] as const;
    await settleCrisisConsequences(
      db,
      { ledger: ids.flatMap((id, i) => idle(id.toString(), roles[i])) },
      targets(),
      40
    );
    const ops = (modifierWrites.mock.calls[0] as unknown as [unknown[]])[0] as {
      updateOne: { update: { $setOnInsert: { pct: number } } };
    }[];
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.update.$setOnInsert.pct).toBe(-MAX_PARTY_ELECTION_PCT);
  });

  it("skips an approval write whose receipt is already recorded", async () => {
    const president = new ObjectId();
    const { db, approvalUpdates } = makeDb([{ _id: president, countryId: "US", party: "red" }]);
    const marked: string[] = [];
    const result = await settleCrisisConsequences(
      db,
      { ledger: idle(president.toString(), "headOfState") },
      targets(),
      40,
      { done: new Set(["national:US"]), mark: (key) => void marked.push(key) }
    );
    expect(approvalUpdates).toHaveLength(0);
    expect(marked).toEqual([]);
    expect(result.approvalWrites).toBe(0);
  });

  it("records a receipt for each approval it writes", async () => {
    const president = new ObjectId();
    const { db } = makeDb([{ _id: president, countryId: "US", party: "red" }]);
    const marked: string[] = [];
    await settleCrisisConsequences(
      db,
      { ledger: idle(president.toString(), "headOfState") },
      targets(),
      40,
      { done: new Set(), mark: (key) => void marked.push(key) }
    );
    expect(marked).toEqual(["national:US"]);
  });
});
