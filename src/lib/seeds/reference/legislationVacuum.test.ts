import { describe, expect, it } from "vitest";
import { generateDefaultEnactedLaws } from "./budgets";
import { getBasePolicies } from "./basePolicies";
import { LEGISLATION_ERA } from "@/lib/era/legislationCatalog";

describe("policy-vacuum seeding — national enacted laws (budgets.ts)", () => {
  it("a 1991 preset seeds no law whose type window postdates 1991", () => {
    const laws = generateDefaultEnactedLaws("1991-default");
    for (const law of laws) {
      const from = LEGISLATION_ERA[law.legislationTypeId];
      if (typeof from !== "number") continue; // always-type
      // enactedYear is the config fiscalYear; the law must not predate its window.
      expect(from, `${law.legislationTypeId} seeded at ${law.enactedYear}`).toBeLessThanOrEqual(
        law.enactedYear as number
      );
    }
  });

  it("a 2019 preset still seeds broadly but drops post-2019 windows (ie_ai_liability_act 2027)", () => {
    const laws2019 = generateDefaultEnactedLaws("2019-default");
    expect(laws2019.length).toBeGreaterThan(0);
    expect(laws2019.some((l) => l.legislationTypeId === "ie_ai_liability_act")).toBe(false);
  });
});

describe("policy-vacuum seeding — default policies (basePolicies.ts)", () => {
  it("a 1991 preset seeds no base policy whose type window postdates 1991", async () => {
    const records = await getBasePolicies("1991-default");
    for (const r of records) {
      const from = LEGISLATION_ERA[r.legislationTypeId];
      if (typeof from !== "number") continue;
      expect(from, `${r.legislationTypeId} (${r.scope})`).toBeLessThanOrEqual(1991);
    }
  });

  it("2019-default drops ie_ai_liability_act (windowed 2027) from base policies", async () => {
    const ids2019 = new Set(
      (await getBasePolicies("2019-default")).map((r) => r.legislationTypeId)
    );
    expect(ids2019.has("ie_ai_liability_act")).toBe(false);
  });

  it("seeds no other era's policy block in a 2019 world", async () => {
    // The Leading Role Statute is a one-party constitutional lever. Poland,
    // Hungary, Romania, Bulgaria, Belarus and Ukraine all existed in 2019; their
    // blocks come from easternBlocPolicyConfig and belong to another era. The
    // Soviet Union, East Germany, Czechoslovakia, Yugoslavia and the Baltic
    // republics did not exist in 2019 at all.
    const ids = (await getBasePolicies("2019-default")).map((r) => r.legislationTypeId);
    for (const prefix of ["su", "dd", "cs", "yu", "bal", "pl", "hu", "ro", "bg", "blr", "ukr"]) {
      expect(
        ids.filter((id) => id.startsWith(`${prefix}_`)),
        prefix
      ).toEqual([]);
    }
  });

  it("still seeds every country the 2019 world does contain", async () => {
    const ids = (await getBasePolicies("2019-default")).map((r) => r.legislationTypeId);
    for (const prefix of ["us", "uk", "jp", "de", "ie", "cn", "fr", "it", "es", "se", "tr"]) {
      expect(
        ids.some((id) => id.startsWith(`${prefix}_`)),
        prefix
      ).toBe(true);
    }
  });
});
