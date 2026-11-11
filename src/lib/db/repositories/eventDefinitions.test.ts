import { describe, expect, it, vi } from "vitest";
import { eventDefinitionsCollection } from "./eventDefinitions";
import type { CollectionSource } from "./source";

describe("eventDefinitions repository", () => {
  it("opens eventDefinitions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = eventDefinitionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("eventDefinitions");
    expect(handle).toEqual({ name: "eventDefinitions" });
  });
});
