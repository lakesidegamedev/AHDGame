import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@/lib/db/types";

const mockLatest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/turn/turnLogQueries", () => ({ getLatestCompletedTurnRealTime: mockLatest }));

import { shouldFireBackupTurn } from "./backupFireGuard";

const state = (fastMode = false) => ({ fastMode }) as GameState;

describe("shouldFireBackupTurn", () => {
  beforeEach(() => mockLatest.mockReset());

  it("always fires in fast mode", async () => {
    expect(await shouldFireBackupTurn(new Date("2026-10-22T20:30:00Z"), state(true), 0)).toBe(true);
    expect(mockLatest).not.toHaveBeenCalled();
  });

  it("skips the :30 backup when the :00 turn completed this hour (minute 0)", async () => {
    mockLatest.mockResolvedValue(new Date("2026-10-22T20:18:00Z"));
    expect(await shouldFireBackupTurn(new Date("2026-10-22T20:30:00Z"), state(), 0)).toBe(false);
  });

  it("fires the :30 backup when the :00 turn did not complete (minute 0)", async () => {
    mockLatest.mockResolvedValue(new Date("2026-10-22T19:18:00Z"));
    expect(await shouldFireBackupTurn(new Date("2026-10-22T20:30:00Z"), state(), 0)).toBe(true);
  });

  it("skips the :00 backup when the :30 turn completed in the previous clock hour (minute 30)", async () => {
    mockLatest.mockResolvedValue(new Date("2026-10-22T20:48:00Z"));
    expect(await shouldFireBackupTurn(new Date("2026-10-22T21:00:00Z"), state(), 30)).toBe(false);
  });

  it("fires the :00 backup when the :30 turn did not complete (minute 30)", async () => {
    mockLatest.mockResolvedValue(new Date("2026-10-22T19:48:00Z"));
    expect(await shouldFireBackupTurn(new Date("2026-10-22T21:00:00Z"), state(), 30)).toBe(true);
  });

  it("fires when no turn has ever completed", async () => {
    mockLatest.mockResolvedValue(null);
    expect(await shouldFireBackupTurn(new Date("2026-10-22T21:00:00Z"), state(), 30)).toBe(true);
  });
});
