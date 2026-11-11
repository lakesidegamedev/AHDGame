import { describe, expect, it, vi } from "vitest";
import { economicVitalSignsCollection } from "./economicVitalSigns";
import type { CollectionSource } from "./source";

describe("economicVitalSigns repository", () => {
  it("opens economicVitalSigns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = economicVitalSignsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("economicVitalSigns");
    expect(handle).toEqual({ name: "economicVitalSigns" });
  });
});
