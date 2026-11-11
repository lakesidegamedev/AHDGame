import { describe, expect, it, vi } from "vitest";
import { resetNationalTreasuriesCollection } from "./resetNationalTreasuries";
import type { CollectionSource } from "./source";

describe("resetNationalTreasuries repository", () => {
  it("opens resetNationalTreasuries on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = resetNationalTreasuriesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("resetNationalTreasuries");
    expect(handle).toEqual({ name: "resetNationalTreasuries" });
  });
});
