import { describe, expect, it, vi } from "vitest";
import { advertisingAgreementsCollection } from "./advertisingAgreements";
import type { CollectionSource } from "./source";

describe("advertisingAgreements repository", () => {
  it("opens advertisingAgreements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = advertisingAgreementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("advertisingAgreements");
    expect(handle).toEqual({ name: "advertisingAgreements" });
  });
});
