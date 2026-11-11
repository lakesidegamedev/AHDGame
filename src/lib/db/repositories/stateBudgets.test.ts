import { describe, expect, it, vi } from "vitest";
import { stateBudgetsCollection } from "./stateBudgets";
import type { CollectionSource } from "./source";

describe("stateBudgets repository", () => {
  it("opens stateBudgets on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stateBudgetsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stateBudgets");
    expect(handle).toEqual({ name: "stateBudgets" });
  });
});
