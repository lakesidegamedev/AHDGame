import { describe, expect, it, vi } from "vitest";
import { resetLawOpeningBoardsCollection } from "./resetLawOpeningBoards";
import type { CollectionSource } from "./source";

describe("resetLawOpeningBoards repository", () => {
  it("opens resetLawOpeningBoards on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = resetLawOpeningBoardsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("resetLawOpeningBoards");
    expect(handle).toEqual({ name: "resetLawOpeningBoards" });
  });
});
