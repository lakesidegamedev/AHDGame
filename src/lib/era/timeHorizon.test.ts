import { describe, expect, it } from "vitest";
import { eraFromYear } from "./era";
import { getEraBand } from "./metricCatalog";
import { getDecadeForYear, TECH_DECADES } from "@/lib/constants/techTree/decades";
import { getActiveTechDecadeIds } from "@/lib/constants/techTree/selectors";
import { doctrineEraForYear } from "@/lib/military/doctrineTree";
import { prospectEraScaling } from "@/lib/constants/prospecting";
import { pickNextCanonicalCycle } from "@/lib/elections/canonicalCycle";

const YEARS = Array.from({ length: 2060 - 2027 + 1 }, (_, i) => 2027 + i);
const LAST_TIER = TECH_DECADES[TECH_DECADES.length - 1];

describe("time horizon contract: 2027 to 2060", () => {
  it("labels eras by decade, including the 2050s", () => {
    for (const y of YEARS) {
      const era = eraFromYear(y);
      expect(era.startYear).toBe(Math.floor(y / 10) * 10);
      expect(era.id).toBe(`${era.startYear}s`);
    }
    expect(eraFromYear(2050).id).toBe("2050s");
    expect(eraFromYear(2051).id).toBe("2050s");
  });

  it("keeps the last tech tier current with an open-ended label", () => {
    for (const y of YEARS.filter((x) => x >= LAST_TIER.startYear)) {
      const decade = getDecadeForYear(y);
      expect(decade.id).toBe(LAST_TIER.id);
      expect(decade.endYear).toBeGreaterThan(y);
      if (y >= LAST_TIER.endYear) expect(decade.label).toBe(`${LAST_TIER.startYear}+`);
    }
    expect(getDecadeForYear(2045).id).toBe("2039");
    expect(getDecadeForYear(2045).label).toBe("2039-2049");
    expect(getDecadeForYear(2050).label).toBe("2039+");
    expect(getDecadeForYear(2051).label).toBe("2039+");
    expect(getDecadeForYear(LAST_TIER.startYear).label).toBe(LAST_TIER.label);
  });

  it("always has an active tech tier set that includes the current tier", () => {
    for (const y of YEARS) {
      const active = getActiveTechDecadeIds(y);
      expect(active.has(getDecadeForYear(y).id)).toBe(true);
    }
  });

  it("maps doctrine eras to a valid index that never goes backwards", () => {
    let prev = -1;
    for (const y of YEARS) {
      const idx = doctrineEraForYear(y);
      expect(Number.isInteger(idx)).toBe(true);
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });

  it("returns finite score bands for representative metrics", () => {
    for (const metricId of ["gdpGrowth", "unemployment", "inflation"]) {
      for (const y of YEARS) {
        const band = getEraBand(metricId, undefined, y);
        if (band === null) continue;
        expect(Number.isFinite(band.best), `${metricId} ${y} best`).toBe(true);
        expect(Number.isFinite(band.worst), `${metricId} ${y} worst`).toBe(true);
      }
    }
  });

  it("returns finite prospecting scaling", () => {
    for (const y of YEARS) {
      const s = prospectEraScaling(y);
      expect(Number.isFinite(s.success + s.yield + s.duration), String(y)).toBe(true);
    }
  });

  it("schedules a next canonical cycle without throwing", () => {
    for (const y of [2027, 2050, 2051, 2060]) {
      const currentTurn = (y - 2027) * 48 + 1;
      const picked = pickNextCanonicalCycle({
        electionType: "house",
        prevCycle: Math.floor((y - 2027) / 2),
        currentTurn,
      });
      if (picked === null) continue;
      expect(Number.isFinite(picked.cycle)).toBe(true);
    }
  });
});
