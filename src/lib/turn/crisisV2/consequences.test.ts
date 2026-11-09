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
    expect(approvalUpdates[0].filter).toMatchObject({ _id: "US" });
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
    expect(stateUpdates[0].filter).toMatchObject({ _id: "TX", countryId: "US" });
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

  describe("exactly-once approval delivery", () => {
    type Op = {
      updateOne: {
        filter: { _id: string; appliedCrisisEffects: { $ne: string } };
        update: [
          {
            $set: {
              appliedCrisisEffects: { $slice: [{ $concatArrays: [unknown, [string]] }, number] };
            };
          },
        ];
      };
    };

    /** In-memory approval store that honours the witness guard in each filter. */
    function witnessStore(characters: Record<string, unknown>[], failure?: () => unknown) {
      const witnesses = new Map<string, string[]>([["US", []]]);
      const applied: string[] = [];
      let calls = 0;
      const approvals = {
        bulkWrite: async (ops: Op[]) => {
          calls += 1;
          for (const [index, { updateOne }] of ops.entries()) {
            const injected = failure?.();
            if (injected === "beforeWrite")
              throw Object.assign(new Error("boom"), { writeErrors: [{ index }] });
            const seen = witnesses.get(updateOne.filter._id) ?? [];
            const witness =
              updateOne.update[0].$set.appliedCrisisEffects.$slice[0].$concatArrays[1][0];
            if (!seen.includes(updateOne.filter.appliedCrisisEffects.$ne)) {
              witnesses.set(updateOne.filter._id, [...seen, witness]);
              applied.push(updateOne.filter._id);
            }
            if (injected === "afterWrite") throw new Error("connection reset");
          }
        },
      };
      const db = {
        collection(name: string) {
          if (name === "characters") return { find: () => ({ toArray: async () => characters }) };
          if (name === "governmentApprovals") return approvals;
          if (name === "stateApprovalHistory") return { bulkWrite: async () => ({}) };
          if (name === "countryModifiers") return { bulkWrite: async () => ({}) };
          throw new Error(`unexpected ${name}`);
        },
      };
      return { db: db as never, applied, calls: () => calls };
    }

    const setup = () => {
      const president = new ObjectId();
      return {
        characters: [{ _id: president, countryId: "US", party: "red" }],
        instance: { ledger: idle(president.toString(), "headOfState") },
        target: targets(),
      };
    };

    it("guards each write with a witness keyed to the crisis and the office", async () => {
      const { characters, instance, target } = setup();
      const { db } = witnessStore(characters);
      const writes: Op[] = [];
      const spy = db as unknown as {
        collection: (n: string) => { bulkWrite: (o: Op[]) => unknown };
      };
      const original = spy.collection("governmentApprovals").bulkWrite;
      spy.collection("governmentApprovals").bulkWrite = async (ops) => {
        writes.push(...ops);
        return original(ops);
      };
      await settleCrisisConsequences(db, instance, target, 40);
      expect(writes[0].updateOne.filter.appliedCrisisEffects.$ne).toBe(
        `${target.crisisId.toHexString()}:national:US`
      );
    });

    it("does not repeat a write when the process died after it landed and before the receipt", async () => {
      const { characters, instance, target } = setup();
      const store = witnessStore(characters);
      await settleCrisisConsequences(store.db, instance, target, 40, {
        done: new Set(),
        mark: () => {},
      });
      await settleCrisisConsequences(store.db, instance, target, 41, {
        done: new Set(),
        mark: () => {},
      });
      expect(store.applied).toEqual(["US"]);
    });

    it("applies once when an ambiguous network error hid a write that had landed", async () => {
      const { characters, instance, target } = setup();
      let first = true;
      const store = witnessStore(characters, () => {
        if (!first) return undefined;
        first = false;
        return "afterWrite";
      });
      const marked: string[] = [];
      const receipts = { done: new Set<string>(), mark: (key: string) => void marked.push(key) };
      await expect(
        settleCrisisConsequences(store.db, instance, target, 40, receipts)
      ).rejects.toThrow("connection reset");
      expect(marked).toEqual([]);
      await settleCrisisConsequences(store.db, instance, target, 41, receipts);
      expect(store.applied).toEqual(["US"]);
      expect(marked).toEqual(["national:US"]);
    });

    it("applies once when the write failed outright and is retried", async () => {
      const { characters, instance, target } = setup();
      let first = true;
      const store = witnessStore(characters, () => {
        if (!first) return undefined;
        first = false;
        return "beforeWrite";
      });
      const receipts = { done: new Set<string>(), mark: () => {} };
      await expect(
        settleCrisisConsequences(store.db, instance, target, 40, receipts)
      ).rejects.toThrow("boom");
      expect(store.applied).toEqual([]);
      await settleCrisisConsequences(store.db, instance, target, 41, receipts);
      expect(store.applied).toEqual(["US"]);
      expect(store.calls()).toBe(2);
    });
  });
});
