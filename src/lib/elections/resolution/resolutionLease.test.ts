import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import {
  RESOLUTION_LEASE_STALE_MS,
  resolutionClaimFilter,
  resolutionReleaseFilter,
} from "./resolutionLease";

type Row = Record<string, unknown>;
type Cond = Record<string, unknown>;

/** Evaluates the small filter subset the lease uses against one row. */
function matches(row: Row, filter: Cond): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Cond[]).some((f) => matches(row, f));
    const value = row[key];
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (cond instanceof ObjectId) return String(value) === String(cond);
    if (cond && typeof cond === "object") {
      const c = cond as Record<string, unknown>;
      if ("$ne" in c && value === c.$ne) return false;
      if ("$exists" in c && (value !== undefined) !== c.$exists) return false;
      if ("$lt" in c) return value instanceof Date && value.getTime() < (c.$lt as Date).getTime();
      return true;
    }
    return value === cond;
  });
}

const T0 = new Date("2027-03-01T12:00:00Z");
const after = (ms: number) => new Date(T0.getTime() + ms);

function claim(row: Row, now: Date): boolean {
  if (!matches(row, resolutionClaimFilter(row._id as ObjectId, now))) return false;
  Object.assign(row, { resolving: true, resolvingAt: now, updatedAt: now });
  return true;
}

function release(row: Row, claimedAt: Date): void {
  if (!matches(row, resolutionReleaseFilter(row._id as ObjectId, claimedAt))) return;
  Object.assign(row, { resolving: false });
  delete row.resolvingAt;
}

const freshRow = (): Row => ({ _id: new ObjectId(), status: "completed", updatedAt: T0 });

describe("resolution lease", () => {
  it("claims a free election", () => {
    const row = freshRow();
    expect(claim(row, T0)).toBe(true);
    expect(row.resolvingAt).toEqual(T0);
  });

  it("refuses a claim while another run holds a live one", () => {
    const row = freshRow();
    expect(claim(row, T0)).toBe(true);
    expect(claim(row, after(RESOLUTION_LEASE_STALE_MS - 1))).toBe(false);
  });

  it("refuses a claim on an election that is not completed", () => {
    const row = { ...freshRow(), status: "resolved" };
    expect(claim(row, T0)).toBe(false);
  });

  it("takes over a claim once it is older than the cutoff", () => {
    const row = freshRow();
    claim(row, T0);
    const later = after(RESOLUTION_LEASE_STALE_MS + 1);
    expect(claim(row, later)).toBe(true);
    expect(row.resolvingAt).toEqual(later);
  });

  it("takes over a legacy claim with no timestamp only when its last write is stale", () => {
    const row: Row = { ...freshRow(), resolving: true };
    expect(claim(row, after(RESOLUTION_LEASE_STALE_MS - 1))).toBe(false);
    expect(claim(row, after(RESOLUTION_LEASE_STALE_MS + 1))).toBe(true);
  });

  it("release clears its own claim", () => {
    const row = freshRow();
    claim(row, T0);
    release(row, T0);
    expect(row.resolving).toBe(false);
    expect(row.resolvingAt).toBeUndefined();
  });

  it("release does not clear a newer claim taken over a stale one", () => {
    const row = freshRow();
    claim(row, T0);
    const takeover = after(RESOLUTION_LEASE_STALE_MS + 1);
    expect(claim(row, takeover)).toBe(true);
    release(row, T0);
    expect(row.resolving).toBe(true);
    expect(row.resolvingAt).toEqual(takeover);
  });
});
