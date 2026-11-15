import { describe, expect, it, vi } from "vitest";
import { congressionalDistrictsCollection } from "./congressionalDistricts";
import type { CollectionSource } from "./source";

describe("congressionalDistricts repository", () => {
  it("opens congressionalDistricts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = congressionalDistrictsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("congressionalDistricts");
    expect(handle).toEqual({ name: "congressionalDistricts" });
  });
});
