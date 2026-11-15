import { describe, expect, it, vi } from "vitest";
import { extractionContractsCollection } from "./extractionContracts";
import type { CollectionSource } from "./source";

describe("extractionContracts repository", () => {
  it("opens extractionContracts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = extractionContractsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("extractionContracts");
    expect(handle).toEqual({ name: "extractionContracts" });
  });
});
