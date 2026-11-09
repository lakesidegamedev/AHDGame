import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { resolveMinWageRatioByCountry } from "./minimumWageLaws";

function fakeDb(rows: Record<string, unknown>[]) {
  const find = vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(rows) });
  const collection = vi.fn().mockReturnValue({ find });
  return { db: { collection } as unknown as Db, collection, find };
}

const rows = [
  { stateId: "federal", legislationTypeId: "us_minimum_wage", policyOptionIndex: 2 },
  {
    stateId: "jp_national",
    legislationTypeId: "jp_minimum_wage",
    policyOptionId: "jp_minimum_wage_opt_1",
  },
  { stateId: "ie_national", legislationTypeId: "ie_minimum_wage", policyOptionIndex: 0 },
  { stateId: "su_national", legislationTypeId: "ng_minimum_wage", policyOptionIndex: 0 },
];

describe("resolveMinWageRatioByCountry", () => {
  it("stage off: admin ratios only, no read", async () => {
    const { db, collection } = fakeDb(rows);
    const out = await resolveMinWageRatioByCountry(
      db,
      [{ countryId: "DE", minimumWageKaitzRatio: 0.6 }, { countryId: "JP" }],
      undefined
    );
    expect(Object.fromEntries(out)).toEqual({ DE: 0.6 });
    expect(collection).not.toHaveBeenCalled();
  });

  it("stage on: national law rows set each country's floor, admin overrides win", async () => {
    const { db, find } = fakeDb(rows);
    const out = await resolveMinWageRatioByCountry(
      db,
      [{ countryId: "IE", minimumWageKaitzRatio: 0.5 }, { countryId: "JP" }, { countryId: "US" }],
      1
    );
    expect(Object.fromEntries(out)).toEqual({ US: 0.65, JP: 0.68, IE: 0.5, RU: 0.6 });
    expect(find.mock.calls[0][0]).toMatchObject({ scope: "national" });
  });
});
