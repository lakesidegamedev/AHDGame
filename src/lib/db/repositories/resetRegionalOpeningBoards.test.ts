import { describe, expect, it, vi } from "vitest";
import { resetRegionalOpeningBoardsCollection } from "./resetRegionalOpeningBoards";
import type { CollectionSource } from "./source";

describe("resetRegionalOpeningBoards repository", () => {
  it("opens resetRegionalOpeningBoards on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = resetRegionalOpeningBoardsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("resetRegionalOpeningBoards");
    expect(handle).toEqual({ name: "resetRegionalOpeningBoards" });
  });
});
