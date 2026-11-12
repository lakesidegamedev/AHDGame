import { describe, expect, it, vi } from "vitest";
import { parliamentaryGovernmentsCollection } from "./parliamentaryGovernments";
import type { CollectionSource } from "./source";

describe("parliamentaryGovernments repository", () => {
  it("opens parliamentaryGovernments on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = parliamentaryGovernmentsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("parliamentaryGovernments");
    expect(handle).toEqual({ name: "parliamentaryGovernments" });
  });
});
