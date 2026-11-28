import { expect, it } from "vitest";
import { dilutionSharesForImf } from "./dilution";

it.each([0, 100_000, 200_000, 399_999, 400_000, 600_000])(
  "respects an existing stake of %i shares",
  (existing) => {
    const issued = dilutionSharesForImf(1_000_000, existing, 40);
    const fraction = (existing + issued) / (1_000_000 + issued);
    if (existing >= 400_000) expect(issued).toBe(0);
    else {
      expect(fraction).toBeLessThanOrEqual(0.4);
      expect((existing + issued + 1) / (1_000_000 + issued + 1)).toBeGreaterThan(0.4);
    }
  }
);

it.each([NaN, Infinity, 0, -1, 100, 150])("refuses invalid target %s", (target) => {
  expect(dilutionSharesForImf(1_000_000, 0, target)).toBe(0);
});
