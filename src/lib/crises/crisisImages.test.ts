import { describe, expect, it } from "vitest";
import { ALL_CRISIS_TEMPLATES } from "@/lib/crises/templates";
import { crisisKind } from "@/lib/crises/rules/boardView";
import { CRISIS_IMAGE_FILES, crisisImageKey, crisisImageUrl } from "./crisisImages";

const subject = (key: string) => {
  const t = ALL_CRISIS_TEMPLATES[key];
  return {
    name: t.name,
    templateKey: key,
    kind: crisisKind({ ...t, status: "active", startTurn: 0 }),
  };
};

describe("crisisImageKey", () => {
  it.each([
    ["wildfire", "wildfire"],
    ["megafire_season", "wildfire"],
    ["flood", "flood"],
    ["coastal_storm_surge_flood", "flood"],
    ["pandemic", "pandemic"],
    ["banking_crisis", "bank"],
    ["war_bank_run", "bank"],
    ["labor_strikes", "strike"],
    ["port_workers_strike", "strike"],
    ["cyber_attack", "cyber"],
    ["power_grid_failure", "blackout"],
    ["housing_collapse", "housing"],
    ["housing_rate_reset_crash", "housing"],
    ["war_panic_buying", "shortage"],
    ["port_closure", "port"],
    ["mass_protests", "protest"],
    ["refugee_crisis", "refugees"],
  ])("maps %s to %s", (templateKey, expected) => {
    expect(crisisImageKey(subject(templateKey))).toBe(expected);
  });

  it("gives every template an image of its own kind, never a throw", () => {
    for (const key of Object.keys(ALL_CRISIS_TEMPLATES)) {
      expect(CRISIS_IMAGE_FILES[crisisImageKey(subject(key))]).toBeTruthy();
    }
  });

  it("falls back to the crisis kind for an unknown name", () => {
    expect(crisisImageKey({ name: "Zzyzx", kind: "war" })).toBe("war");
    expect(crisisImageKey({ name: "Zzyzx", kind: "political" })).toBe("government");
  });

  it("uses one scenery photo for every opportunity", () => {
    expect(crisisImageKey({ name: "Olympic Hosting Bid", kind: "opportunity" })).toBe("globe");
  });
});

describe("crisisImageUrl", () => {
  it("builds a stable Commons FilePath url at the requested width", () => {
    const url = crisisImageUrl({ name: "Wildfire", kind: "disaster" }, 960);
    expect(url).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//);
    expect(url.endsWith("?width=960")).toBe(true);
  });

  it("only points at Commons files", () => {
    for (const file of Object.values(CRISIS_IMAGE_FILES)) {
      expect(file).toMatch(/\.(jpg|jpeg|png|JPG)$/);
    }
  });
});
