import { describe, expect, it, vi } from "vitest";
import { sourceFenceConsumptionsCollection } from "./sourceFenceConsumptions";
import type { CollectionSource } from "./source";

describe("sourceFenceConsumptions repository", () => {
  it("opens sourceFenceConsumptions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = sourceFenceConsumptionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("sourceFenceConsumptions");
    expect(handle).toEqual({ name: "sourceFenceConsumptions" });
  });
});
