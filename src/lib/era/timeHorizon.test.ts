import { describe, expect, it } from "vitest";
import { ERA_DOMAIN, eraFromYear } from "./era";
import { getEraBand } from "./metricCatalog";
import { METRIC_BAND_CURVES } from "./metricBandCurves";
import { getDecadeForYear, TECH_DECADES } from "@/lib/constants/techTree/decades";
import { getActiveTechDecadeIds } from "@/lib/constants/techTree/selectors";
import { doctrineEraForYear } from "@/lib/military/doctrineTree";
import { prospectEraScaling } from "@/lib/constants/prospecting";
import { pickNextCanonicalCycle } from "@/lib/elections/canonicalCycle";
import { getCycleAnchors } from "@/lib/elections/cycleAnchorContext";
import { eraIdForYear, resolveEraBlend } from "@/lib/seeds/eraInterpolation";
import { photoYearFromUrl, portraitsForYear } from "@/lib/npp/generator";

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
    expect(getDecadeForYear(2051).id).toBe("2049");
    expect(getDecadeForYear(2051).label).toBe("2049-2059");
    expect(getDecadeForYear(2060).label).toBe("2049+");
    expect(getDecadeForYear(2075).label).toBe("2049+");
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

describe("score bands are authored to 2050", () => {
  const CORE5 = [
    "gdpGrowth",
    "unemploymentRate",
    "lifeExpectancy",
    "violentCrimeRate",
    "povertyRate",
  ];

  it("defines core-5 bands at 2050 that are defined and keep drifting past 2040 for every core country", () => {
    for (const metricId of CORE5) {
      for (const countryId of ["US", "UK", "DE", "JP", "CN", undefined]) {
        const b2050 = getEraBand(metricId, countryId, 2050);
        const b2040 = getEraBand(metricId, countryId, 2040);
        expect(b2050, `${metricId} ${countryId}`).not.toBeNull();
        expect(Number.isFinite(b2050!.best) && Number.isFinite(b2050!.worst)).toBe(true);
        expect(b2050!.best).not.toBe(b2050!.worst);
        // Unemployment is authored flat from 2040 to 2050; the rest keep drifting.
        if (metricId !== "unemploymentRate") expect(b2050).not.toEqual(b2040);
        else expect(b2050).toEqual(b2040);
      }
    }
  });

  it("interpolates between the 2040 and 2050 anchors", () => {
    const a = getEraBand("lifeExpectancy", "US", 2040)!;
    const b = getEraBand("lifeExpectancy", "US", 2050)!;
    const mid = getEraBand("lifeExpectancy", "US", 2045)!;
    expect(mid.best).toBeCloseTo((a.best + b.best) / 2);
    expect(mid.worst).toBeCloseTo((a.worst + b.worst) / 2);
  });

  it("gives every curve an anchor at 2050 and holds saturation bands at their 2019 values", () => {
    for (const [metricId, curve] of Object.entries(METRIC_BAND_CURVES)) {
      const sets = [curve.global, ...Object.values(curve.byCountry ?? {})];
      for (const anchors of sets) {
        if (!anchors) continue;
        expect(anchors[anchors.length - 1].year, metricId).toBeGreaterThanOrEqual(2050);
      }
    }
    expect(getEraBand("housingAffordability", undefined, 2050)).toEqual(
      getEraBand("housingAffordability", undefined, 2019)
    );
  });
});

describe("late-game boundaries", () => {
  it("keeps the era domain past the last authored decade", () => {
    expect(ERA_DOMAIN.max).toBeGreaterThanOrEqual(2099);
    expect(eraFromYear(2099).id).toBe("2090s");
  });

  it("holds the newest era bundle for every year after its anchor", () => {
    for (const y of YEARS) {
      const blend = resolveEraBlend(y);
      expect(blend.lo).toBe("2027");
      expect(blend.hi).toBe("2027");
      expect(blend.t).toBe(0);
      expect(eraIdForYear(y)).toBe("2027");
    }
  });

  it("throws on a preset with no election anchors instead of using 2019 years", () => {
    expect(() => getCycleAnchors({ startingYear: 2027, preset: "2061-default" })).toThrow();
  });

  it("reads photo years into the 2090s and keeps late photos usable", () => {
    for (const y of [2030, 2045, 2050, 2099]) {
      expect(photoYearFromUrl(`https://example.test/photo_${y}_x.jpg`)).toBe(y);
    }
    const pool = [{ photoYear: 2031 }, { photoYear: 2075 }, { photoYear: null }];
    expect(portraitsForYear(pool, 2055)).toEqual(pool);
    expect(portraitsForYear(pool, 2030)).toEqual([{ photoYear: 2031 }, { photoYear: null }]);
  });
});
