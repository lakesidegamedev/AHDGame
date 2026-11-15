import { describe, expect, it, vi } from "vitest";
import { sovereignCouponClaimsCollection } from "./sovereignCouponClaims";
import type { CollectionSource } from "./source";

describe("sovereignCouponClaims repository", () => {
  it("opens sovereignCouponClaims on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = sovereignCouponClaimsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("sovereignCouponClaims");
    expect(handle).toEqual({ name: "sovereignCouponClaims" });
  });
});
