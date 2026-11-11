import { describe, expect, it, vi } from "vitest";
import { indexFundCommandsCollection } from "./indexFundCommands";
import type { CollectionSource } from "./source";

describe("indexFundCommands repository", () => {
  it("opens indexFundCommands on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = indexFundCommandsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("indexFundCommands");
    expect(handle).toEqual({ name: "indexFundCommands" });
  });
});
