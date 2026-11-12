import { describe, expect, it } from "vitest";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { buildMinWageRatioByCountry, MIN_WAGE_KAITZ_MAX } from "@/lib/labour/laborCost";
import {
  buildMinWageRatioWithLaws,
  minimumWageLawKaitz,
  minimumWageLawOn,
  MINIMUM_WAGE_LAW_KAITZ_MAX,
  MINIMUM_WAGE_LAW_SCALES,
  MINIMUM_WAGE_LAW_TYPE_IDS,
  SAVED_WORLD_MINIMUM_WAGE_LAW_SCALES,
  policyOptionIndexOf,
} from "./minimumWageLaw";

// The reference catalog carries every country's catalog.
const catalog = legislationTypes;

describe("minimum wage law scales", () => {
  it("covers every national minimum wage law in the catalogs and matches their options", () => {
    const national = catalog.filter(
      (t) => /^[a-z]{2}_minimum_wage$/.test(t._id) && t.allowedScope !== "state"
    );
    expect(national.map((t) => t._id).sort()).toEqual(
      MINIMUM_WAGE_LAW_TYPE_IDS.filter(
        (id) => !id.includes(".") && !SAVED_WORLD_MINIMUM_WAGE_LAW_SCALES[id]
      ).sort()
    );
    for (const type of national) {
      const scale = MINIMUM_WAGE_LAW_SCALES[type._id]!;
      const options = type.policyOptions ?? [];
      const perOption = scale.optionRates ?? scale.optionKaitz ?? [];
      expect(perOption, type._id).toHaveLength(options.length);
      if (scale.optionRates) {
        expect(
          options.map((o) => o.minimumWageRate),
          type._id
        ).toEqual(scale.optionRates);
      }
    }
  });

  it("puts each country's current statutory option on its real Kaitz ratio", () => {
    expect(minimumWageLawKaitz("us.economy.workerSecurity.primary", 1)).toBe(0.28);
    expect(minimumWageLawKaitz("de.economy.workerSecurity.primary", 2)).toBe(0.55);
    expect(minimumWageLawKaitz("ie_minimum_wage", 3)).toBe(0.6);
    expect(minimumWageLawKaitz("jp.economy.workerSecurity.primary", 2)).toBe(0.45);
  });

  it("gives abolition options, unknown laws and unknown options no floor", () => {
    expect(minimumWageLawKaitz("de.economy.workerSecurity.primary", 0)).toBe(0);
    expect(minimumWageLawKaitz("jp.economy.workerSecurity.primary", 0)).toBe(0);
    expect(minimumWageLawKaitz("cn_minimum_wage", 6)).toBe(0);
    expect(minimumWageLawKaitz("jp.economy.workerSecurity.primary", 9)).toBe(0);
    expect(minimumWageLawKaitz("jp.economy.workerSecurity.primary", null)).toBe(0);
    expect(minimumWageLawKaitz("us_state_minimum_wage", 0)).toBe(0);
  });

  it("stays within the labour system cap", () => {
    expect(MINIMUM_WAGE_LAW_KAITZ_MAX).toBe(MIN_WAGE_KAITZ_MAX);
    for (const id of MINIMUM_WAGE_LAW_TYPE_IDS) {
      for (let i = 0; i < 7; i++) {
        const k = minimumWageLawKaitz(id, i);
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThanOrEqual(MIN_WAGE_KAITZ_MAX);
      }
    }
  });

  it("reads the option index from the row or from its id", () => {
    expect(policyOptionIndexOf({ policyOptionIndex: 2 })).toBe(2);
    expect(policyOptionIndexOf({ policyOptionId: "minimum_wage_opt_4" })).toBe(4);
    expect(policyOptionIndexOf({ policyOptionId: "l3" })).toBe(3);
    expect(policyOptionIndexOf({ policyOptionId: "custom" })).toBeNull();
  });

  it("is gated on the stage", () => {
    expect(minimumWageLawOn(undefined)).toBe(false);
    expect(minimumWageLawOn(null)).toBe(false);
    expect(minimumWageLawOn(0)).toBe(false);
    expect(minimumWageLawOn(1)).toBe(true);
  });
});

describe("buildMinWageRatioWithLaws", () => {
  const budgets = [{ countryId: "US" }, { countryId: "DE" }, { countryId: "JP" }];

  it("sets the floor from an enacted law", () => {
    const out = buildMinWageRatioWithLaws(budgets, [
      {
        countryId: "DE",
        legislationTypeId: "de.economy.workerSecurity.primary",
        policyOptionIndex: 4,
      },
    ]);
    expect(out.get("DE")).toBe(0.82);
    expect(out.has("US")).toBe(false);
  });

  it("follows an amendment to a different option", () => {
    const before = buildMinWageRatioWithLaws(budgets, [
      {
        countryId: "JP",
        legislationTypeId: "jp.economy.workerSecurity.primary",
        policyOptionId: "l2",
      },
    ]);
    const after = buildMinWageRatioWithLaws(budgets, [
      {
        countryId: "JP",
        legislationTypeId: "jp.economy.workerSecurity.primary",
        policyOptionId: "l4",
      },
    ]);
    expect(before.get("JP")).toBe(0.45);
    expect(after.get("JP")).toBe(0.68);
  });

  it("clears the floor on repeal or abolition", () => {
    expect(buildMinWageRatioWithLaws(budgets, []).size).toBe(0);
    const abolished = buildMinWageRatioWithLaws(budgets, [
      {
        countryId: "JP",
        legislationTypeId: "jp.economy.workerSecurity.primary",
        policyOptionIndex: 0,
      },
    ]);
    expect(abolished.has("JP")).toBe(false);
  });

  it("lets an admin override win, including an explicit zero", () => {
    const policies = [
      {
        countryId: "DE",
        legislationTypeId: "de.economy.workerSecurity.primary",
        policyOptionIndex: 4,
      },
      {
        countryId: "JP",
        legislationTypeId: "jp.economy.workerSecurity.primary",
        policyOptionIndex: 4,
      },
    ];
    const out = buildMinWageRatioWithLaws(
      [
        { countryId: "DE", minimumWageKaitzRatio: 0.4 },
        { countryId: "JP", minimumWageKaitzRatio: 0 },
        { countryId: "US", minimumWageKaitzRatio: 0.3 },
      ],
      policies
    );
    expect(out.get("DE")).toBe(0.4);
    expect(out.has("JP")).toBe(false);
    expect(out.get("US")).toBe(0.3);
    // A cleared override (absent or null) hands the country back to its law.
    const cleared = buildMinWageRatioWithLaws(
      [{ countryId: "DE", minimumWageKaitzRatio: null }, { countryId: "JP" }],
      policies
    );
    expect(cleared.get("DE")).toBe(0.82);
    expect(cleared.get("JP")).toBe(0.68);
  });

  it("keeps each country's floor separate", () => {
    const out = buildMinWageRatioWithLaws(budgets, [
      {
        countryId: "DE",
        legislationTypeId: "de.economy.workerSecurity.primary",
        policyOptionIndex: 2,
      },
      {
        countryId: "JP",
        legislationTypeId: "jp.economy.workerSecurity.primary",
        policyOptionIndex: 4,
      },
      { countryId: "NG", legislationTypeId: "ng_minimum_wage", policyOptionIndex: 0 },
      { countryId: "US", legislationTypeId: "unrelated_law", policyOptionIndex: 0 },
    ]);
    expect(Object.fromEntries(out)).toEqual({ DE: 0.55, JP: 0.68, NG: 0.6 });
  });

  it("matches the admin-only map when no law is in force", () => {
    const admin = [{ countryId: "DE", minimumWageKaitzRatio: 0.6 }, { countryId: "US" }];
    expect(buildMinWageRatioWithLaws(admin, [])).toEqual(buildMinWageRatioByCountry(admin));
  });
});

describe("saved worlds on old minimum wage laws", () => {
  it("never lists a saved-world law that new worlds still seed", () => {
    for (const id of Object.keys(SAVED_WORLD_MINIMUM_WAGE_LAW_SCALES))
      expect(
        catalog.some((t) => t._id === id),
        id
      ).toBe(false);
  });

  it("keeps the floor a saved world enacted before its country joined the law book", () => {
    const out = buildMinWageRatioWithLaws(
      [],
      [
        { countryId: "JP", legislationTypeId: "jp_minimum_wage", policyOptionIndex: 3 },
        {
          countryId: "DE",
          legislationTypeId: "de_minimum_wage",
          policyOptionId: "de_minimum_wage_opt_3",
        },
      ]
    );
    expect(out.get("JP")).toBe(0.45);
    expect(out.get("DE")).toBe(0.55);
    expect(MINIMUM_WAGE_LAW_TYPE_IDS).toContain("jp_minimum_wage");
  });

  it("keeps China's old-book floor, whose options run from the highest floor down", () => {
    const out = buildMinWageRatioWithLaws(
      [],
      [{ countryId: "CN", legislationTypeId: "cn_minimum_wage", policyOptionIndex: 1 }]
    );
    expect(out.get("CN")).toBe(0.4);
    expect(minimumWageLawKaitz("cn_minimum_wage", 5)).toBe(0);
  });
});
