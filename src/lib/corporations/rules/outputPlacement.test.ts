import { describe, expect, it } from "vitest";
import { outputPlacement, placementPercents, placementSentence } from "./outputPlacement";
import { buildRoomVerdict } from "./buildRoomVerdict";

describe("outputPlacement", () => {
  it("never counts output sent to own sites as unsold", () => {
    const p = outputPlacement({ sold: 0.54, ownSites: 0.46 });
    expect(p).toEqual({ sold: 0.54, ownSites: expect.closeTo(0.46, 9), unsold: 0 });
    expect(placementSentence(p!)).toBe("54% sold to buyers, 46% sent to your own sites, 0% unsold");
  });

  it("reports the real remainder as unsold and always adds to 100", () => {
    const p = outputPlacement({ sold: 0.333, ownSites: 0.333 })!;
    const pct = placementPercents(p);
    expect(pct.sold + pct.ownSites + pct.unsold).toBe(100);
    expect(pct.unsold).toBe(34);
  });

  it("caps own-site share so shares never pass 100%", () => {
    expect(outputPlacement({ sold: 0.9, ownSites: 0.5 })).toEqual({
      sold: 0.9,
      ownSites: expect.closeTo(0.1, 9),
      unsold: 0,
    });
  });

  it("is unknown when the sold share is not measured", () => {
    expect(outputPlacement({ sold: null })).toBeNull();
  });
});

describe("buildRoomVerdict", () => {
  it("separates measured room, measured none and unknown", () => {
    expect(buildRoomVerdict(12)).toBe("room");
    expect(buildRoomVerdict(0)).toBe("none");
    expect(buildRoomVerdict(null)).toBe("unknown");
    expect(buildRoomVerdict(undefined)).toBe("unknown");
    expect(buildRoomVerdict(Number.NaN)).toBe("unknown");
  });
});
