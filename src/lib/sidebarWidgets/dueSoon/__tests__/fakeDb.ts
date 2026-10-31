import { vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { DueSoonContext } from "../types";

/** A fake Db whose `find` returns fixed rows per collection and records each filter. */
export function fakeDueSoonDb(rows: Record<string, unknown[]>) {
  const filters: Record<string, unknown[]> = {};
  const db = {
    collection: (name: string) => ({
      find: vi.fn((filter: unknown) => {
        (filters[name] ??= []).push(filter);
        const cursor = {
          project: () => cursor,
          sort: () => cursor,
          limit: () => cursor,
          toArray: async () => rows[name] ?? [],
        };
        return cursor;
      }),
      findOne: vi.fn(async (filter: unknown) => {
        (filters[name] ??= []).push(filter);
        return rows[name]?.[0] ?? null;
      }),
    }),
  } as unknown as Db;
  return { db, filters };
}

export function dueSoonContext(db: Db, overrides: Partial<DueSoonContext> = {}): DueSoonContext {
  const characterId = overrides.characterId ?? new ObjectId();
  return {
    db,
    characterId,
    charKey: characterId.toString(),
    countryId: "US",
    currentTurn: 100,
    preset: undefined,
    now: new Date("2026-01-01T00:00:00Z"),
    seats: [],
    ...overrides,
  };
}
