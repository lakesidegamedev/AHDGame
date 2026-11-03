import { describe, expect, it } from "vitest";
import {
  getNewCharacterTransferBarrier,
  getNewCorporationFoundingBarrier,
  NEW_CHARACTER_TRANSFER_BARRIER_TURNS,
} from "./newCharacterTransferBarrier";
import { MS_PER_TURN } from "@/lib/constants/turnTime";

const now = new Date("2026-05-30T16:00:00Z").getTime();

describe("getNewCharacterTransferBarrier — turn-first", () => {
  it("blocked: currentTurn within the 48-turn window", () => {
    const s = getNewCharacterTransferBarrier({ createdTurn: 100 }, 110, now);
    expect(s.blocked).toBe(true);
    expect(s.remainingTurns).toBe(38); // 100 + 48 - 110
  });

  it("not blocked: currentTurn exactly at the window end", () => {
    const s = getNewCharacterTransferBarrier({ createdTurn: 100 }, 148, now);
    expect(s.blocked).toBe(false);
    expect(s.remainingTurns).toBe(0);
  });

  it("not blocked: currentTurn past the window", () => {
    const s = getNewCharacterTransferBarrier({ createdTurn: 100 }, 200, now);
    expect(s.blocked).toBe(false);
    expect(s.remainingTurns).toBe(0);
  });

  it("turn field wins even if the Date fallback would say otherwise", () => {
    // createdAt is ancient (would pass on Date) but createdTurn says still blocked.
    const ancient = new Date(now - 999 * MS_PER_TURN);
    const s = getNewCharacterTransferBarrier({ createdTurn: 100, createdAt: ancient }, 110, now);
    expect(s.blocked).toBe(true);
  });
});

describe("getNewCharacterTransferBarrier — Date fallback (legacy docs)", () => {
  it("blocked when createdAt within the window and no turn field", () => {
    const createdAt = new Date(now - 10 * MS_PER_TURN); // 10 turns ago
    const s = getNewCharacterTransferBarrier({ createdAt }, 0, now);
    expect(s.blocked).toBe(true);
    expect(s.remainingTurns).toBe(38); // ceil((48 - 10) turns)
  });

  it("not blocked when the full window has elapsed", () => {
    const createdAt = new Date(now - 48 * MS_PER_TURN);
    const s = getNewCharacterTransferBarrier({ createdAt }, 0, now);
    expect(s.blocked).toBe(false);
    expect(s.remainingTurns).toBe(0);
  });

  it("accepts an ISO string createdAt", () => {
    const createdAt = new Date(now - 10 * MS_PER_TURN).toISOString();
    const s = getNewCharacterTransferBarrier({ createdAt }, 0, now);
    expect(s.blocked).toBe(true);
  });
});

describe("getNewCharacterTransferBarrier — neither field", () => {
  it("not blocked when no createdTurn and no createdAt", () => {
    const s = getNewCharacterTransferBarrier({}, 50, now);
    expect(s.blocked).toBe(false);
    expect(s.remainingTurns).toBe(0);
  });

  it("exposes the 48-turn constant", () => {
    expect(NEW_CHARACTER_TRANSFER_BARRIER_TURNS).toBe(48);
  });
});

describe("corporation founding grace period", () => {
  it("waives only creation while the world founding period is active", () => {
    expect(getNewCorporationFoundingBarrier({ createdTurn: 100 }, 100, now, true).blocked).toBe(
      false
    );
    expect(
      getNewCorporationFoundingBarrier({ createdTurn: 100 }, 147, now, false).remainingTurns
    ).toBe(1);
    expect(getNewCorporationFoundingBarrier({ createdTurn: 100 }, 148, now, false).blocked).toBe(
      false
    );
    expect(getNewCharacterTransferBarrier({ createdTurn: 100 }, 100, now).blocked).toBe(true);
  });
});
