import { describe, it, expect } from "vitest";
import { computeExtractionCapacityMultipliers, fullOutputMultipliers } from "./extractionCapacity";
import type { ExtractableResource } from "@/lib/constants/commodities";
import type { StateResourceCapacity } from "@/lib/db/types/stateResourceCapacity";
import type { ExtractionContract } from "@/lib/db/types/extractionContract";
import { ObjectId } from "mongodb";

function makeCapacity(
  stateId: string,
  resources: Partial<Record<ExtractableResource, number>>
): StateResourceCapacity {
  return {
    _id: new ObjectId(),
    stateId,
    countryId: "US",
    resources,
    updatedAt: new Date(),
  };
}

function makeContract(
  stateId: string,
  corporationId: ObjectId,
  resource: ExtractableResource,
  share: number
): ExtractionContract {
  return {
    _id: new ObjectId(),
    stateId,
    countryId: "US",
    corporationId,
    resource,
    share,
    grantedTurn: 1,
    grantedBy: "state-legislature",
    grantedByLevel: "state",
    updatedAt: new Date(),
  };
}

const corp1 = new ObjectId();
const corp2 = new ObjectId();

describe("computeExtractionCapacityMultipliers", () => {
  it("returns multiplier 1 for all sectors when no capacity docs exist", () => {
    const sectors = [
      { sectorId: "s1", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 10000 } },
    ];
    const result = computeExtractionCapacityMultipliers(sectors, [], []);
    expect(result.get("s1")?.oil).toBe(1);
  });

  it("returns multiplier 1 when open-access output is below pool", () => {
    const sectors = [
      { sectorId: "s1", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 5000 } },
    ];
    const capacities = [makeCapacity("TX", { oil: 10000 })];
    const result = computeExtractionCapacityMultipliers(sectors, [], capacities);
    expect(result.get("s1")?.oil).toBe(1);
  });

  it("scales open-access sectors proportionally when demand exceeds pool", () => {
    const sectors = [
      { sectorId: "s1", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 8000 } },
      { sectorId: "s2", stateId: "TX", corporationId: corp2, revenueBasedOutput: { oil: 8000 } },
    ];
    const capacities = [makeCapacity("TX", { oil: 10000 })];
    const result = computeExtractionCapacityMultipliers(sectors, [], capacities);
    // totalOADemand=16000, pool=10000, multiplier=10000/16000=0.625
    expect(result.get("s1")?.oil).toBeCloseTo(0.625);
    expect(result.get("s2")?.oil).toBeCloseTo(0.625);
  });

  it("adds multiple concessions for the same company without leaking reserved capacity to open access", () => {
    const sectors = [
      { sectorId: "s1", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 40000 } },
      { sectorId: "s2", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 60000 } },
      { sectorId: "s3", stateId: "TX", corporationId: corp2, revenueBasedOutput: { oil: 100000 } },
    ];
    const capacities = [makeCapacity("TX", { oil: 100000 })];
    const contracts = [
      makeContract("TX", corp1, "oil", 0.2),
      makeContract("TX", corp1, "oil", 0.3),
    ];
    for (const ordered of [contracts, [...contracts].reverse()]) {
      const result = computeExtractionCapacityMultipliers(sectors, ordered, capacities);
      // corp1 reserves 50k of its 100k; its other 50k and corp2's 100k share
      // the 50k open pool pro rata (1/3 each unit).
      expect(result.get("s1")?.oil).toBeCloseTo(2 / 3);
      expect(result.get("s2")?.oil).toBeCloseTo(2 / 3);
      expect(result.get("s3")?.oil).toBeCloseTo(1 / 3);
    }
  });

  it("lets a contract holder draw on the open pool beyond its lease (ticket 1619)", () => {
    const sectors = [
      { sectorId: "s1", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 80000 } },
    ];
    const capacities = [makeCapacity("TX", { oil: 100000 })];
    const contracts = [makeContract("TX", corp1, "oil", 0.5)];
    const result = computeExtractionCapacityMultipliers(sectors, contracts, capacities);
    // 50k reserved + the remaining 30k from a 50k open pool nobody else wants.
    expect(result.get("s1")?.oil).toBe(1);
  });

  it("does not cap contract-holder when revenue output is below contracted capacity", () => {
    const sectors = [
      { sectorId: "s1", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 20000 } },
    ];
    const capacities = [makeCapacity("TX", { oil: 100000 })];
    const contracts = [makeContract("TX", corp1, "oil", 0.5)];
    const result = computeExtractionCapacityMultipliers(sectors, contracts, capacities);
    // allocatedCap = 50000; output = 20000; 20000 < 50000 → multiplier = 1
    expect(result.get("s1")?.oil).toBe(1);
  });

  it("shares one corporate contract across all of that corporation's sectors", () => {
    const sectors = [
      { sectorId: "s1", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 40000 } },
      { sectorId: "s2", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 40000 } },
    ];
    const capacities = [makeCapacity("TX", { oil: 100000 })];
    const contracts = [makeContract("TX", corp1, "oil", 0.5)];

    const result = computeExtractionCapacityMultipliers(sectors, contracts, capacities);

    expect(result.get("s1")?.oil).toBe(1);
    expect(result.get("s2")?.oil).toBe(1);
  });

  it("squeezes open-access to zero when contracts over-allocate", () => {
    const sectors = [
      // corp1 has 60% contract
      { sectorId: "s1", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 5000 } },
      // corp2 has 50% contract
      { sectorId: "s2", stateId: "TX", corporationId: corp2, revenueBasedOutput: { oil: 5000 } },
      // corp3 open-access — squeezed out
      {
        sectorId: "s3",
        stateId: "TX",
        corporationId: new ObjectId(),
        revenueBasedOutput: { oil: 5000 },
      },
    ];
    const capacities = [makeCapacity("TX", { oil: 100000 })];
    const contracts = [
      makeContract("TX", corp1, "oil", 0.6),
      makeContract("TX", corp2, "oil", 0.5),
    ];
    const result = computeExtractionCapacityMultipliers(sectors, contracts, capacities);
    expect(result.get("s3")?.oil).toBe(0); // open-access pool = max(0, 1 - 1.1) = 0
  });

  it("resolves each resource independently", () => {
    const sectors = [
      {
        sectorId: "s1",
        stateId: "TX",
        corporationId: corp1,
        revenueBasedOutput: { oil: 80000, coal: 5000 },
      },
    ];
    const capacities = [makeCapacity("TX", { oil: 100000, coal: 20000 })];
    const contracts = [makeContract("TX", corp1, "oil", 0.5)]; // oil contract only
    const result = computeExtractionCapacityMultipliers(sectors, contracts, capacities);
    expect(result.get("s1")?.oil).toBe(1); // lease plus open pool
    expect(result.get("s1")?.coal).toBe(1); // open-access, within pool
  });

  it("never lets buying a lease lower a company's dig", () => {
    const sectors = [
      { sectorId: "s1", stateId: "MN", corporationId: corp1, revenueBasedOutput: { iron: 90000 } },
      { sectorId: "s2", stateId: "MN", corporationId: corp2, revenueBasedOutput: { iron: 30000 } },
    ];
    const capacities = [makeCapacity("MN", { iron: 100000 })];
    const without = computeExtractionCapacityMultipliers(sectors, [], capacities);
    const withLease = computeExtractionCapacityMultipliers(
      sectors,
      [makeContract("MN", corp1, "iron", 0.1)],
      capacities
    );
    expect(withLease.get("s1")!.iron!).toBeGreaterThanOrEqual(without.get("s1")!.iron! - 1e-12);
  });

  it("keeps a holder's unused reserved share out of the open pool", () => {
    const sectors = [
      { sectorId: "s1", stateId: "TX", corporationId: corp1, revenueBasedOutput: { oil: 10000 } },
      { sectorId: "s2", stateId: "TX", corporationId: corp2, revenueBasedOutput: { oil: 100000 } },
    ];
    const capacities = [makeCapacity("TX", { oil: 100000 })];
    const result = computeExtractionCapacityMultipliers(
      sectors,
      [makeContract("TX", corp1, "oil", 0.5)],
      capacities
    );
    expect(result.get("s1")?.oil).toBe(1);
    expect(result.get("s2")?.oil).toBeCloseTo(0.5);
  });
});

describe("computeExtractionCapacityMultipliers with plant output caps (#4503)", () => {
  const mn = (iron: number) => [makeCapacity("MN", { iron })];

  it("does not ration mines whose real dig fits the deposit though nameplate does not", () => {
    const sectors = [
      {
        sectorId: "s1",
        stateId: "MN",
        corporationId: corp1,
        revenueBasedOutput: { iron: 6000 },
        plantOutputCap: { iron: 3000 },
      },
      {
        sectorId: "s2",
        stateId: "MN",
        corporationId: corp2,
        revenueBasedOutput: { iron: 6000 },
        plantOutputCap: { iron: 3000 },
      },
    ];
    const result = computeExtractionCapacityMultipliers(sectors, [], mn(10000));
    expect(result.get("s1")?.iron).toBe(1);
    expect(result.get("s2")?.iron).toBe(1);
  });

  it("still rations pro-rata when real dig exceeds the deposit", () => {
    const sectors = [
      {
        sectorId: "s1",
        stateId: "MN",
        corporationId: corp1,
        revenueBasedOutput: { iron: 10000 },
        plantOutputCap: { iron: 8000 },
      },
      {
        sectorId: "s2",
        stateId: "MN",
        corporationId: corp2,
        revenueBasedOutput: { iron: 10000 },
        plantOutputCap: { iron: 2000 },
      },
    ];
    const result = computeExtractionCapacityMultipliers(sectors, [], mn(5000));
    // The multiplier is the fraction of the CAPPED desire granted.
    expect(result.get("s1")?.iron).toBeCloseTo(0.5);
    expect(result.get("s2")?.iron).toBeCloseTo(0.5);
    // Granted units fill the deposit exactly, never more.
    expect(8000 * result.get("s1")!.iron! + 2000 * result.get("s2")!.iron!).toBeCloseTo(5000);
  });

  it("reserves a lease against capped desire and lets the holder compete beyond it", () => {
    const contracts = [makeContract("MN", corp1, "iron", 0.2)];
    const fits = computeExtractionCapacityMultipliers(
      [
        {
          sectorId: "s1",
          stateId: "MN",
          corporationId: corp1,
          revenueBasedOutput: { iron: 10000 },
          plantOutputCap: { iron: 4000 },
        },
        {
          sectorId: "s2",
          stateId: "MN",
          corporationId: corp2,
          revenueBasedOutput: { iron: 10000 },
          plantOutputCap: { iron: 3000 },
        },
      ],
      contracts,
      mn(10000)
    );
    expect(fits.get("s1")?.iron).toBe(1);
    expect(fits.get("s2")?.iron).toBe(1);
    // Holder: 2000 reserved, then its 4000 residual shares the 8000 pool with 6000.
    const binds = computeExtractionCapacityMultipliers(
      [
        {
          sectorId: "s1",
          stateId: "MN",
          corporationId: corp1,
          revenueBasedOutput: { iron: 10000 },
          plantOutputCap: { iron: 6000 },
        },
        {
          sectorId: "s2",
          stateId: "MN",
          corporationId: corp2,
          revenueBasedOutput: { iron: 10000 },
          plantOutputCap: { iron: 6000 },
        },
      ],
      contracts,
      mn(10000)
    );
    expect(6000 * binds.get("s1")!.iron!).toBeCloseTo(2000 + 4000 * 0.8);
    expect(6000 * binds.get("s2")!.iron!).toBeCloseTo(6000 * 0.8);
  });

  it("is identical to the uncapped result when no cap is supplied", () => {
    const base = [
      {
        sectorId: "s1",
        stateId: "MN",
        corporationId: corp1,
        revenueBasedOutput: { iron: 9000, coal: 4000 },
      },
      { sectorId: "s2", stateId: "MN", corporationId: corp2, revenueBasedOutput: { iron: 7000 } },
    ];
    const capacities = [makeCapacity("MN", { iron: 10000, coal: 3000 })];
    const contracts = [makeContract("MN", corp1, "iron", 0.3)];
    const uncapped = computeExtractionCapacityMultipliers(base, contracts, capacities);
    const withEmptyCaps = computeExtractionCapacityMultipliers(
      base.map((s) => ({ ...s, plantOutputCap: {} })),
      contracts,
      capacities
    );
    expect(withEmptyCaps).toEqual(uncapped);
  });

  it("falls back to uncapped output for a resource with no usable cap", () => {
    const sectors = [
      {
        sectorId: "s1",
        stateId: "MN",
        corporationId: corp1,
        revenueBasedOutput: { iron: 6000 },
        plantOutputCap: { iron: Number.NaN },
      },
      { sectorId: "s2", stateId: "MN", corporationId: corp2, revenueBasedOutput: { iron: 6000 } },
    ];
    const result = computeExtractionCapacityMultipliers(sectors, [], mn(10000));
    expect(result.get("s1")?.iron).toBeCloseTo(10000 / 12000);
    expect(result.get("s2")?.iron).toBeCloseTo(10000 / 12000);
  });

  it("gives an idle mine (cap 0) no claim on the deposit", () => {
    const sectors = [
      {
        sectorId: "idle",
        stateId: "MN",
        corporationId: corp1,
        revenueBasedOutput: { iron: 8000 },
        plantOutputCap: { iron: 0 },
      },
      {
        sectorId: "busy",
        stateId: "MN",
        corporationId: corp2,
        revenueBasedOutput: { iron: 8000 },
        plantOutputCap: { iron: 8000 },
      },
    ];
    const result = computeExtractionCapacityMultipliers(sectors, [], mn(10000));
    expect(result.get("busy")?.iron).toBe(1);
    expect(result.get("idle")?.iron).toBe(1);
  });
});

describe("fullOutputMultipliers (#4503 corp phase)", () => {
  it("re-expresses a bound capped grant as a share of full output, never above the grant", () => {
    // A half-parked mine claims 5000 of its 10000 nameplate and gets 4000.
    const sectors = [
      {
        sectorId: "parked",
        stateId: "MN",
        corporationId: corp1,
        revenueBasedOutput: { iron: 10000 },
        plantOutputCap: { iron: 5000 },
      },
      {
        sectorId: "full",
        stateId: "MN",
        corporationId: corp2,
        revenueBasedOutput: { iron: 10000 },
        plantOutputCap: { iron: 10000 },
      },
    ];
    const capped = computeExtractionCapacityMultipliers(
      sectors,
      [],
      [makeCapacity("MN", { iron: 12000 })]
    );
    const full = fullOutputMultipliers(sectors, capped);
    expect(10000 * full.get("parked")!.iron!).toBeCloseTo(4000);
    expect(10000 * full.get("full")!.iron!).toBeCloseTo(8000);
    // The hard-min reads min(1, util / active) on active capacity: dig = grant.
    const dig = 10000 * 0.5 * Math.min(1, full.get("parked")!.iron! / 0.5);
    expect(dig).toBeCloseTo(4000);
  });

  it("keeps an unbound or idle mine at 1 and leaves uncapped sectors untouched", () => {
    const sectors = [
      {
        sectorId: "idle",
        stateId: "MN",
        corporationId: corp1,
        revenueBasedOutput: { iron: 8000 },
        plantOutputCap: { iron: 0 },
      },
      {
        sectorId: "parked",
        stateId: "MN",
        corporationId: corp1,
        revenueBasedOutput: { iron: 8000 },
        plantOutputCap: { iron: 4000 },
      },
      {
        sectorId: "plain",
        stateId: "WI",
        corporationId: corp2,
        revenueBasedOutput: { iron: 9000 },
      },
    ];
    const capped = computeExtractionCapacityMultipliers(
      sectors,
      [],
      [makeCapacity("MN", { iron: 10000 }), makeCapacity("WI", { iron: 3000 })]
    );
    const full = fullOutputMultipliers(sectors, capped);
    expect(full.get("idle")?.iron).toBe(1);
    expect(full.get("parked")?.iron).toBe(1);
    expect(full.get("plain")).toEqual(capped.get("plain"));
  });
});
