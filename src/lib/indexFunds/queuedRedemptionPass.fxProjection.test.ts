/**
 * The pass-level FX map has to key on the field the rate read actually returns.
 *
 * Mongo drops every unprojected field from an inclusion projection, so a read
 * that projects only `rate` comes back without `currencyCode`. Keying the map on
 * `row.currencyCode` then yields one `undefined` key and every fund currency
 * looks rate-less, which silently defers the whole queued-redemption pass
 * (console.warn only, no turn warning, no queue row claimed). The in-memory test
 * db ignores `find` options, so this only shows up against a projection-aware
 * read.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { IndexFund } from "@/lib/db/types";
import { prepareQueuedRedemptionPass } from "./processQueuedRedemptions";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const RATES = [
  { _id: "US", currencyCode: "USD", rate: 1.0760805768117734 },
  { _id: "DE", currencyCode: "EUR", rate: 0.7564990831143393 },
];

/** Mongo applies inclusion projections server-side; the in-memory db does not. */
function project(row: Record<string, unknown>, projection?: Record<string, number>) {
  if (!projection) return row;
  if (!Object.values(projection).includes(1)) return row;
  const out: Record<string, unknown> = { _id: row._id };
  for (const [key, value] of Object.entries(projection)) if (value === 1) out[key] = row[key];
  return out;
}

function emptyCursor(): Record<string, unknown> {
  const cursor: Record<string, unknown> = {};
  for (const method of ["sort", "project", "limit"]) cursor[method] = () => emptyCursor();
  cursor.toArray = async () => [];
  return cursor;
}

const db = {
  collection(name: string) {
    if (name === "exchangeRates") {
      return {
        find: (_filter: unknown, options?: { projection?: Record<string, number> }) => ({
          toArray: async () => RATES.map((row) => project(row, options?.projection)),
        }),
      };
    }
    return { find: () => emptyCursor(), findOne: async () => null };
  },
} as unknown as Db;

const fund = {
  _id: new ObjectId(),
  slug: "fx-projection",
  anchorCurrencyCode: "EUR",
} as IndexFund;

describe("queued redemption pass FX map", () => {
  it("finds the rate for the fund's anchor currency through a Mongo projection", async () => {
    const context = await prepareQueuedRedemptionPass(db, [fund], true);
    expect(context.fxRateByCurrency.get("EUR")).toEqual({
      rate: 0.7564990831143393,
      ok: true,
    });
  });
});
