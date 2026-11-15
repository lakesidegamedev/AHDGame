import { describe, expect, it, vi } from "vitest";
import { resetDepartmentOpeningBoardsCollection } from "./resetDepartmentOpeningBoards";
import type { CollectionSource } from "./source";

describe("resetDepartmentOpeningBoards repository", () => {
  it("opens resetDepartmentOpeningBoards on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = resetDepartmentOpeningBoardsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("resetDepartmentOpeningBoards");
    expect(handle).toEqual({ name: "resetDepartmentOpeningBoards" });
  });
});
