import { describe, expect, it, vi } from "vitest";
import { regionalBudgetsCollection } from "./regionalBudgets";
import type { CollectionSource } from "./source";

describe("regionalBudgets repository", () => {
  it("opens regionalBudgets on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = regionalBudgetsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("regionalBudgets");
    expect(handle).toEqual({ name: "regionalBudgets" });
  });
});
