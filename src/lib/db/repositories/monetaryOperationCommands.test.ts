import { describe, expect, it, vi } from "vitest";
import { monetaryOperationCommandsCollection } from "./monetaryOperationCommands";
import type { CollectionSource } from "./source";

describe("monetaryOperationCommands repository", () => {
  it("opens monetaryOperationCommands on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = monetaryOperationCommandsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("monetaryOperationCommands");
    expect(handle).toEqual({ name: "monetaryOperationCommands" });
  });
});
