import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import {
  appleExemptsDiscordGate,
  banProviderSubjects,
  isProviderSubjectBanned,
  providerSubjectHash,
  recordProviderLinkEvent,
  unbanProviderSubjects,
} from "./providerLinkHistory";

type Doc = Record<string, unknown>;

function fakeDb() {
  const store: Record<string, Doc[]> = {};
  const rows = (name: string) => (store[name] ??= []);
  const matches = (doc: Doc, filter: Doc): boolean =>
    Object.entries(filter).every(([key, cond]) => {
      if (key === "$or") return (cond as Doc[]).some((f) => matches(doc, f));
      if (cond && typeof cond === "object" && "$ne" in (cond as Doc)) {
        return String(doc[key]) !== String((cond as Doc).$ne);
      }
      return String(doc[key]) === String(cond);
    });
  const collection = (name: string) => ({
    insertOne: async (doc: Doc) => void rows(name).push(doc),
    findOne: async (filter: Doc) => rows(name).find((d) => matches(d, filter)) ?? null,
    find: (filter: Doc, options?: { limit?: number }) => ({
      toArray: async () => {
        const found = rows(name)
          .filter((d) => matches(d, filter))
          .sort((x, y) => Number(x.at ?? 0) - Number(y.at ?? 0));
        return options?.limit ? found.slice(0, options.limit) : found;
      },
    }),
    deleteMany: async (filter: Doc) => {
      store[name] = rows(name).filter((d) => !matches(d, filter));
    },
    bulkWrite: async (ops: { updateOne: { filter: Doc; update: { $setOnInsert: Doc } } }[]) => {
      for (const { updateOne } of ops) {
        if (!rows(name).some((d) => matches(d, updateOne.filter))) {
          rows(name).push(updateOne.update.$setOnInsert);
        }
      }
    },
  });
  return { db: { collection } as never, store };
}

describe("provider link history", () => {
  beforeEach(() => vi.stubEnv("AUTH_SECRET", "test-secret-for-hash"));
  afterEach(() => vi.unstubAllEnvs());

  it("hashes subjects with a key and never returns the raw id", () => {
    const hash = providerSubjectHash("apple", "synthetic.sub.1");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).not.toContain("synthetic");
    expect(providerSubjectHash("google", "synthetic.sub.1")).not.toBe(hash);
  });

  it("returns no hash without a server secret", () => {
    vi.stubEnv("AUTH_SECRET", "");
    expect(providerSubjectHash("apple", "x")).toBeNull();
  });

  it("records link and unlink rows holding only the hash", async () => {
    const { db, store } = fakeDb();
    const userId = new ObjectId();
    await recordProviderLinkEvent(db, {
      userId,
      provider: "apple",
      providerId: "sub-1",
      action: "link",
    });
    await recordProviderLinkEvent(db, {
      userId,
      provider: "apple",
      providerId: "sub-1",
      action: "unlink",
    });
    const rows = store.providerLinkHistory;
    expect(rows.map((r) => r.action)).toEqual(["link", "unlink"]);
    expect(JSON.stringify(rows)).not.toContain("sub-1");
  });

  it("swallows write failures", async () => {
    const db = {
      collection: () => ({
        insertOne: async () => {
          throw new Error("down");
        },
      }),
    } as never;
    await expect(
      recordProviderLinkEvent(db, {
        userId: new ObjectId(),
        provider: "discord",
        providerId: "d1",
        action: "link",
      })
    ).resolves.toBeUndefined();
  });

  it("bans every linked login account and refuses them afterwards", async () => {
    const { db, store } = fakeDb();
    const when = new Date("2026-01-01T00:00:00Z");
    await banProviderSubjects(
      db,
      { appleId: "a1", discordId: "d1" },
      { reason: "r", bannedBy: "admin", bannedAt: when }
    );
    expect(store.bannedDevices.map((r) => r.kind).sort()).toEqual(["apple", "discord"]);
    expect(await isProviderSubjectBanned(db, "apple", "a1")).toBe(true);
    expect(await isProviderSubjectBanned(db, "google", "a1")).toBe(false);
    expect(await isProviderSubjectBanned(db, "discord", "other")).toBe(false);
  });

  it("unban removes the login account rows", async () => {
    const { db } = fakeDb();
    const account = { googleId: "g1" };
    await banProviderSubjects(db, account, {
      reason: "r",
      bannedBy: "admin",
      bannedAt: new Date(),
    });
    await unbanProviderSubjects(db, account);
    expect(await isProviderSubjectBanned(db, "google", "g1")).toBe(false);
  });

  it("exempts an Apple ID once: a second account is refused", async () => {
    const { db } = fakeDb();
    const first = new ObjectId();
    const second = new ObjectId();
    const t = (n: number) => new Date(2026, 0, n);
    expect(await appleExemptsDiscordGate(db, first, "apple-x")).toBe(true);
    await recordProviderLinkEvent(db, {
      userId: first,
      provider: "apple",
      providerId: "apple-x",
      action: "link",
      at: t(1),
    });
    await recordProviderLinkEvent(db, {
      userId: first,
      provider: "apple",
      providerId: "apple-x",
      action: "unlink",
      at: t(2),
    });
    await recordProviderLinkEvent(db, {
      userId: second,
      provider: "apple",
      providerId: "apple-x",
      action: "link",
      at: t(3),
    });
    expect(await appleExemptsDiscordGate(db, second, "apple-x")).toBe(false);
    expect(await appleExemptsDiscordGate(db, first, "apple-x")).toBe(true);
    expect(await appleExemptsDiscordGate(db, second, null)).toBe(false);
  });
});
