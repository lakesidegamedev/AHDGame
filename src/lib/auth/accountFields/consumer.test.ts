import { beforeEach, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import {
  FEED_LEASE_MS,
  FEED_LOCK_ID,
  applyAccountChange,
  getAccountFieldsStatus,
  pollAccountChanges,
} from "./consumer";
import type { AccountChange, AccountChangesPage } from "./rules";

type Doc = Record<string, unknown>;

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Doc[]).some((f) => matches(doc, f));
    const value = doc[key];
    if (cond instanceof ObjectId) return value instanceof ObjectId && value.equals(cond);
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Doc;
      return Object.entries(c).every(([op, arg]) => {
        if (op === "$ne")
          return !(value instanceof ObjectId && arg instanceof ObjectId
            ? value.equals(arg)
            : value === arg);
        if (op === "$lte") return value instanceof Date && value <= (arg as Date);
        if (op === "$gt") return value instanceof Date && value > (arg as Date);
        if (op === "$exists") return (value !== undefined) === arg;
        return false;
      });
    }
    return value === cond;
  });
}

function collection(rows: Doc[]) {
  return {
    findOne: async (filter: Doc) => rows.find((r) => matches(r, filter)) ?? null,
    countDocuments: async (filter: Doc) => rows.filter((r) => matches(r, filter)).length,
    updateOne: async (filter: Doc, update: Doc, opts?: { upsert?: boolean }) => {
      let row = rows.find((r) => matches(r, filter));
      let upserted = 0;
      if (!row) {
        if (!opts?.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        if (rows.some((r) => r._id === filter._id))
          throw Object.assign(new Error("dup"), { code: 11000 });
        row = { _id: filter._id };
        rows.push(row);
        upserted = 1;
      }
      let modified = 0;
      for (const [k, v] of Object.entries((update.$set ?? {}) as Doc)) {
        if (row[k] !== v) modified = 1;
        row[k] = v;
      }
      for (const k of Object.keys((update.$unset ?? {}) as Doc)) {
        if (k in row) modified = 1;
        delete row[k];
      }
      for (const [k, v] of Object.entries((update.$max ?? {}) as Doc)) {
        const cur = row[k] as number | Date | undefined;
        if (cur === undefined || (v as number | Date) > cur) {
          row[k] = v;
          modified = 1;
        }
      }
      for (const [k, v] of Object.entries((update.$push ?? {}) as Doc)) {
        row[k] = [...((row[k] as unknown[]) ?? []), v];
        modified = 1;
      }
      return { matchedCount: upserted ? 0 : 1, modifiedCount: modified, upsertedCount: upserted };
    },
  };
}

let users: Doc[];
let locks: Doc[];
const db = {
  collection: (name: string) => collection(name === "users" ? users : locks),
} as unknown as Db;

const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const T0 = new Date("2030-01-01T00:00:00Z");

function change(seq: number, kind: string, extra: Partial<AccountChange> = {}): AccountChange {
  return { seq, ahdUserId: A, kind, at: Date.parse("2029-12-31T00:00:00Z"), ...extra };
}

function feed(pages: AccountChangesPage[]) {
  const calls: number[] = [];
  let i = 0;
  return {
    calls,
    fetchPage: async (after: number) => {
      calls.push(after);
      return pages[Math.min(i++, pages.length - 1)] ?? null;
    },
  };
}

beforeEach(() => {
  users = [
    { _id: new ObjectId(A), email: "old@example.invalid", password: "hash" },
    { _id: new ObjectId(B), email: "other@example.invalid", password: "hash2" },
  ];
  locks = [];
});

describe("applyAccountChange", () => {
  it("updates the email and keeps the previous one in history", async () => {
    const out = await applyAccountChange(
      db,
      change(1, "email", { email: " New@Example.INVALID " }),
      T0
    );
    expect(out).toBe("applied");
    expect(users[0].email).toBe("new@example.invalid");
    expect(users[0].emailHistory).toEqual([
      {
        email: "old@example.invalid",
        changedAt: new Date(Date.parse("2029-12-31T00:00:00Z")),
        source: "central",
      },
    ]);
  });

  it("is idempotent on replay", async () => {
    const c = change(1, "email", { email: "new@example.invalid" });
    await applyAccountChange(db, c, T0);
    expect(await applyAccountChange(db, c, T0)).toBe("unchanged");
    expect(users[0].emailHistory).toHaveLength(1);
  });

  it("does not write when another account holds the email", async () => {
    const out = await applyAccountChange(
      db,
      change(1, "email", { email: "OTHER@example.invalid" }),
      T0
    );
    expect(out).toEqual({ error: expect.stringContaining("already held") });
    expect(users[0].email).toBe("old@example.invalid");
    expect(users[0].emailHistory).toBeUndefined();
  });

  it("clears the local password and stamps supersession, replay keeps the first stamp", async () => {
    expect(await applyAccountChange(db, change(1, "password"), T0)).toBe("applied");
    expect(users[0].password).toBeUndefined();
    const stamp = users[0].passwordSupersededAt;
    expect(stamp).toEqual(new Date(Date.parse("2029-12-31T00:00:00Z")));
    expect(await applyAccountChange(db, change(1, "password"), T0)).toBe("unchanged");
    expect(users[0].passwordSupersededAt).toEqual(stamp);
    expect(users[1].password).toBe("hash2");
  });

  it("ignores unknown kinds and unknown users", async () => {
    expect(await applyAccountChange(db, change(1, "username"), T0)).toBe("ignored");
    expect(
      await applyAccountChange(
        db,
        change(2, "password", { ahdUserId: "cccccccccccccccccccccccc" }),
        T0
      )
    ).toBe("ignored");
    expect(users[0].password).toBe("hash");
  });
});

describe("pollAccountChanges", () => {
  it("applies changes in order and advances the cursor to next", async () => {
    const { fetchPage, calls } = feed([
      {
        changes: [change(5, "email", { email: "n@example.invalid" }), change(6, "password")],
        next: 6,
      },
    ]);
    const res = await pollAccountChanges({ db, owner: "w1", now: () => T0, fetchPage });
    expect(res).toEqual({ status: "ok", applied: 2, skipped: 0, cursor: 6 });
    expect(calls).toEqual([0]);
    const status = await getAccountFieldsStatus(db);
    expect(status.cursor).toBe(6);
    expect(status.lastPollAt).toBe(T0.toISOString());
    expect(status.accountsWithoutLocalPassword).toBe(1);
  });

  it("resumes from the stored cursor and replayed seqs change nothing", async () => {
    const page = { changes: [change(1, "email", { email: "n@example.invalid" })], next: 1 };
    await pollAccountChanges({ db, owner: "w1", now: () => T0, fetchPage: feed([page]).fetchPage });
    const second = feed([page]);
    const res = await pollAccountChanges({
      db,
      owner: "w1",
      now: () => T0,
      fetchPage: second.fetchPage,
    });
    expect(second.calls).toEqual([1]);
    expect(res).toMatchObject({ status: "ok", applied: 0 });
    expect(users[0].emailHistory).toHaveLength(1);
  });

  it("ignores unknown kinds but still moves the cursor", async () => {
    const { fetchPage } = feed([{ changes: [change(9, "username")], next: 9 }]);
    const res = await pollAccountChanges({ db, owner: "w1", now: () => T0, fetchPage });
    expect(res).toMatchObject({ status: "ok", applied: 0, skipped: 1, cursor: 9 });
  });

  it("records a guard error for a duplicate email and continues", async () => {
    const { fetchPage } = feed([
      {
        changes: [change(1, "email", { email: "other@example.invalid" }), change(2, "password")],
        next: 2,
      },
    ]);
    const res = await pollAccountChanges({ db, owner: "w1", now: () => T0, fetchPage });
    expect(res).toMatchObject({ status: "ok", applied: 1, skipped: 1, cursor: 2 });
    const status = await getAccountFieldsStatus(db);
    expect(status.lastError).toContain("already held");
    expect(users[0].email).toBe("old@example.invalid");
    expect(users[0].password).toBeUndefined();
  });

  it("does not advance the cursor when the feed is unreachable", async () => {
    const res = await pollAccountChanges({
      db,
      owner: "w1",
      now: () => T0,
      fetchPage: async () => null,
    });
    expect(res).toEqual({ status: "error", error: "account feed unavailable" });
    const status = await getAccountFieldsStatus(db);
    expect(status.cursor).toBe(0);
    expect(status.lastError).toBe("account feed unavailable");
  });

  it("holds the cursor at the last applied change when a write throws", async () => {
    const broken = {
      ...db,
      collection: (name: string) => {
        const c = collection(name === "users" ? users : locks);
        if (name !== "users") return c;
        return {
          ...c,
          updateOne: async (f: Doc, u: Doc) => {
            if ("$unset" in u) throw new Error("boom");
            return c.updateOne(f, u);
          },
        };
      },
    } as unknown as Db;
    const { fetchPage } = feed([
      {
        changes: [change(1, "email", { email: "n@example.invalid" }), change(2, "password")],
        next: 2,
      },
    ]);
    const res = await pollAccountChanges({ db: broken, owner: "w1", now: () => T0, fetchPage });
    expect(res.status).toBe("error");
    expect((await getAccountFieldsStatus(db)).cursor).toBe(1);
  });

  it("lets only one consumer poll while the lease is live", async () => {
    const { fetchPage } = feed([{ changes: [], next: 0 }]);
    expect((await pollAccountChanges({ db, owner: "w1", now: () => T0, fetchPage })).status).toBe(
      "ok"
    );
    const during = new Date(T0.getTime() + FEED_LEASE_MS - 1);
    expect(await pollAccountChanges({ db, owner: "w2", now: () => during, fetchPage })).toEqual({
      status: "busy",
    });
    const after = new Date(T0.getTime() + FEED_LEASE_MS + 1);
    expect(
      (await pollAccountChanges({ db, owner: "w2", now: () => after, fetchPage })).status
    ).toBe("ok");
    expect(locks.find((l) => l._id === FEED_LOCK_ID)?.owner).toBe("w2");
  });

  it("the same owner can poll again immediately", async () => {
    const { fetchPage } = feed([{ changes: [], next: 0 }]);
    await pollAccountChanges({ db, owner: "w1", now: () => T0, fetchPage });
    expect((await pollAccountChanges({ db, owner: "w1", now: () => T0, fetchPage })).status).toBe(
      "ok"
    );
  });
});
