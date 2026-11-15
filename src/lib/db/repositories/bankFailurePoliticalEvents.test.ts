import { describe, expect, it, vi } from "vitest";
import { bankFailurePoliticalEventsCollection } from "./bankFailurePoliticalEvents";
import type { CollectionSource } from "./source";

describe("bankFailurePoliticalEvents repository", () => {
  it("opens bankFailurePoliticalEvents on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bankFailurePoliticalEventsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bankFailurePoliticalEvents");
    expect(handle).toEqual({ name: "bankFailurePoliticalEvents" });
  });
});
