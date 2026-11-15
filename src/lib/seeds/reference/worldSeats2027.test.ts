import { describe, expect, it } from "vitest";

import { TOTAL_DE_BUNDESTAG_SEATS } from "@/lib/constants/states";
import { lowerChamberMajorityThreshold } from "@/lib/legislature/lowerChamberSeats";
import {
  DE_BUNDESTAG_2027,
  JP_SANGIIN_2027,
  JP_SHUGIIN_2027,
  UK_COMMONS_2027,
} from "./worldSeats2027";

function total(rows: Array<{ seatsHeld?: number }>): number {
  return rows.reduce((sum, row) => sum + (row.seatsHeld ?? 1), 0);
}

function byParty(rows: Array<{ party: string; seatsHeld?: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.party] = (out[row.party] ?? 0) + (row.seatsHeld ?? 1);
  return out;
}

describe("2027 modern legislature snapshots", () => {
  it("reproduces the 2024 UK Commons result", () => {
    expect(total(UK_COMMONS_2027)).toBe(650);
  });

  it("seats the full 630-seat Bundestag from the 2025 result", () => {
    expect(total(DE_BUNDESTAG_2027)).toBe(TOTAL_DE_BUNDESTAG_SEATS);
    expect(byParty(DE_BUNDESTAG_2027)).toEqual({
      de_cdu: 164,
      de_csu: 44,
      de_afd: 152,
      de_spd: 120,
      de_greens: 85,
      de_linke: 64,
      de_independent: 1,
    });
  });

  it("allows a Bundestag majority without the AfD", () => {
    const seats = byParty(DE_BUNDESTAG_2027);
    expect(seats.de_cdu + seats.de_csu + seats.de_spd).toBe(328);
    expect(seats.de_cdu + seats.de_csu + seats.de_spd).toBeGreaterThanOrEqual(
      lowerChamberMajorityThreshold(TOTAL_DE_BUNDESTAG_SEATS)
    );
  });

  it("keeps the CSU in Bavaria and the CDU out of it", () => {
    for (const row of DE_BUNDESTAG_2027) {
      if (row.party === "de_csu") expect(row.state).toBe("BY");
      if (row.party === "de_cdu") expect(row.state).not.toBe("BY");
    }
    expect(new Set(DE_BUNDESTAG_2027.map((row) => row.state)).size).toBe(16);
  });

  it("reproduces the current Japanese chamber membership", () => {
    expect(total(JP_SHUGIIN_2027)).toBe(465);
    expect(total(JP_SANGIIN_2027)).toBe(247);
  });
});
