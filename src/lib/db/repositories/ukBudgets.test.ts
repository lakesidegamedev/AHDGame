import { describe, expect, it, vi } from "vitest";
import { ukBudgetsCollection } from "./ukBudgets";
import type { CollectionSource } from "./source";

describe("ukBudgets repository", () => {
  it("opens ukBudgets on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukBudgetsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukBudgets");
    expect(handle).toEqual({ name: "ukBudgets" });
  });
});
