import { describe, expect, it } from "vitest";
import { householdProducerFixture } from "../testing/householdProducerFixture";
import { produceHouseholdSource } from "./produceHouseholdSource";
import { householdPublication } from "./householdPublication";

const produce = (f: ReturnType<typeof householdProducerFixture>) =>
  produceHouseholdSource({ ...f, countryId: f.countryId });
describe("current household source producer and fiscal reconciliation", () => {
  it.each(["US", "UK", "JP"] as const)(
    "produces and publishes complete %s current owners",
    (country) => {
      const f = householdProducerFixture(country),
        before = structuredClone(f),
        result = produce(f);
      expect(result.path).toBe("produced");
      expect(f).toEqual(before);
      const observations = householdPublication({
        worldId: f.worldId,
        countryId: country,
        turn: f.turn,
        regionIds: f.regionIds,
        source: result.source,
        programs: f.programs,
        settlements: f.settlements,
      });
      expect(observations.size).toBe(2);
      expect(observations.values().next().value!["03"]!.value).toBe(0);
    }
  );
  it("removes historical cash when actual current funding is zero", () => {
    const f = householdProducerFixture();
    f.settlements.get("cash-law")!.outlaid = 0;
    const result = produce(f);
    expect(result.path).toBe("produced");
    expect(result.source!.coverage.reconciliation!.paidCashTransfers).toBe(0);
    expect(
      result.source!.inputs.every((r) => r.groups.every((g) => g.paidCashTransfers === 0))
    ).toBe(true);
  });
  const changes: [string, (f: ReturnType<typeof householdProducerFixture>) => void][] = [
    [
      "forecast revenue",
      (f) => {
        f.fiscalControls.basis = "budget-forecast";
      },
    ],
    [
      "player-only receipts",
      (f) => {
        f.fiscalControls.population = "players-only";
      },
    ],
    [
      "self-generated controls",
      (f) => {
        f.fiscalControls.sourceId = f.current.ownerId;
      },
    ],
    [
      "stale fiscal totals",
      (f) => {
        f.fiscalControls.turn--;
      },
    ],
    [
      "wrong-world totals",
      (f) => {
        f.fiscalControls.worldId = "another";
      },
    ],
    [
      "missing cash receipt",
      (f) => {
        f.settlements.clear();
      },
    ],
    [
      "stale cash receipt",
      (f) => {
        f.settlements.get("cash-law")!.lastSettledTurn--;
      },
    ],
    [
      "wrong law option",
      (f) => {
        f.programs[0]!.choice = "replacement";
      },
    ],
    [
      "unreviewed eligibility",
      (f) => {
        f.current.programRoles = f.current.programRoles.map((r) => ({
          ...r,
          recipients: undefined,
        }));
      },
    ],
    [
      "cash with no recipients",
      (f) => {
        f.current.programRoles = f.current.programRoles.map((r) => ({ ...r, recipients: [] }));
      },
    ],
    [
      "population incompleteness",
      (f) => {
        f.reference.population = "multi-person-only";
      },
    ],
    [
      "marginal averages",
      (f) => {
        f.reference.distribution = "marginal-means";
      },
    ],
    [
      "source gap",
      (f) => {
        f.reference.gaps = ["missing-composition"];
      },
    ],
    [
      "missing current group",
      (f) => {
        f.current.cells = f.current.cells.slice(1);
      },
    ],
    [
      "duplicated current group",
      (f) => {
        f.current.cells = [...f.current.cells, f.current.cells[0]!];
      },
    ],
    [
      "wrong current region",
      (f) => {
        f.current.regions = f.current.regions.map((r) => ({ ...r, regionId: "unknown" }));
      },
    ],
    [
      "income mismatch",
      (f) => {
        f.fiscalControls.annualMarketIncome++;
      },
    ],
    [
      "deduction mismatch",
      (f) => {
        f.fiscalControls.annualEmployeeContributions++;
      },
    ],
    [
      "regional booked allocations",
      (f) => {
        f.programs[0]!.scope = "regional";
      },
    ],
  ];
  it.each(changes)("keeps legacy for %s", (_, change) => {
    const f = householdProducerFixture();
    change(f);
    const result = produce(f);
    expect(result.path).toBe("legacy");
    expect(result.gaps.length).toBeGreaterThan(0);
  });
  it("does not count paid services as cash transfers", () => {
    const f = householdProducerFixture();
    f.current.programRoles = f.current.programRoles.map((r) => ({ ...r, role: "service" }));
    const result = produce(f);
    expect(result.path).toBe("produced");
    expect(result.source!.coverage.reconciliation!.paidCashTransfers).toBe(0);
  });
});
