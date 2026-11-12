import { describe, expect, it } from "vitest";
import { buildPartyTurnoutTargetCatalog, partyTurnoutTargetLabel } from "./partyTurnoutTarget";
import {
  isValidPartyTurnoutTarget,
  resolvePartyTurnoutTargetLean,
} from "./partyTurnoutTargetResolver";
import { getTurnoutTargetsForCountry } from "./turnoutTargets";

const LEGACY_GROUP_TARGETS: Array<[string, string, string]> = [
  ["UK", "uk_voterGroups", "urban_progressives"],
  ["JP", "jp_voterGroups", "komeito_faithful"],
  ["DE", "de_voterGroups", "workers"],
  ["US", "ideology", "evangelicals"],
];

describe("party turnout targets", () => {
  it("resolves a census bucket from the same catalog as the region display", () => {
    const target = resolvePartyTurnoutTargetLean("UK", "education", "degree_plus", "1953-default");

    expect(target?.economicLean).toEqual(expect.any(Number));
    expect(target?.socialLean).toEqual(expect.any(Number));
  });

  it.each(LEGACY_GROUP_TARGETS)(
    "rejects the legacy voter group %s %s:%s",
    (cc, category, group) => {
      expect(isValidPartyTurnoutTarget(cc, category, group, "1953-default")).toBe(false);
      expect(resolvePartyTurnoutTargetLean(cc, category, group, "1953-default")).toBeNull();
    }
  );

  it("offers only census buckets", () => {
    const catalog = buildPartyTurnoutTargetCatalog(
      getTurnoutTargetsForCountry("UK", "1953-default")
    );

    expect(catalog.categories.map((category) => category.id)).toEqual(
      expect.arrayContaining(["ethnicity", "age", "education", "income", "urbanization"])
    );
    expect(catalog.categories.map((category) => category.id)).not.toContain("uk_voterGroups");
    expect(catalog.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "education", group: "degree_plus" }),
      ])
    );
    expect(catalog.targets.some((target) => target.category === "uk_voterGroups")).toBe(false);
  });

  it("uses the same finite leans in the picker and the turn resolver", () => {
    const catalog = buildPartyTurnoutTargetCatalog(
      getTurnoutTargetsForCountry("US", "1953-default")
    );
    const pickerTarget = catalog.targets.find(
      (target) => target.category === "race" && target.group === "white"
    );
    const resolved = resolvePartyTurnoutTargetLean("US", "race", "white", "1953-default");

    expect(pickerTarget).toBeDefined();
    expect(Number.isFinite(pickerTarget!.economicLean)).toBe(true);
    expect(resolved).toMatchObject({
      economicLean: pickerTarget!.economicLean,
      socialLean: pickerTarget!.socialLean,
    });
  });

  it("labels targets by census bucket", () => {
    expect(partyTurnoutTargetLabel("UK", "education", "degree_plus")).toBe("Degree or higher");
  });

  it("rejects a bucket from another country's electorate", () => {
    expect(isValidPartyTurnoutTarget("UK", "race", "black", "1953-default")).toBe(false);
  });
});
