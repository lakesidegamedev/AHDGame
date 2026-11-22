import { describe, expect, it } from "vitest";
import { unservedDemandReason } from "./unservedDemandReason";
import type { UnsoldReading } from "./unsoldReason";

const reading = (reason: UnsoldReading["reason"]): UnsoldReading => ({
  reason,
  unsoldShare: 0.3,
  askUnitPrice: 10,
  marketUnitPrice: 9,
});

describe("unservedDemandReason", () => {
  it("is null when no demand went unfilled", () => {
    expect(
      unservedDemandReason({ unmetUnits: 0, offered: 10, soldOutside: 5, ownSites: 0 })
    ).toBeNull();
    expect(
      unservedDemandReason({ unmetUnits: null, offered: 10, soldOutside: 5, ownSites: 0 })
    ).toBeNull();
  });

  it("says sold out when sales plus own-site deliveries take the whole offer", () => {
    expect(
      unservedDemandReason({ unmetUnits: 50, offered: 100, soldOutside: 60, ownSites: 40 })
    ).toBe("sold_out");
  });

  it("names the ask when buyers paid less and part of the offer is unsold", () => {
    expect(
      unservedDemandReason({
        unmetUnits: 50,
        offered: 100,
        soldOutside: 40,
        ownSites: 0,
        unsold: reading("ask_above_market"),
      })
    ).toBe("ask_above_buyers");
  });

  it("falls back to reach when the ask was competitive and units still sat", () => {
    expect(
      unservedDemandReason({
        unmetUnits: 50,
        offered: 100,
        soldOutside: 40,
        ownSites: 0,
        unsold: reading("buyers_exhausted"),
      })
    ).toBe("not_reached");
  });

  it("reports nothing offered", () => {
    expect(unservedDemandReason({ unmetUnits: 5, offered: 0, soldOutside: 0, ownSites: 0 })).toBe(
      "not_offered"
    );
  });
});
