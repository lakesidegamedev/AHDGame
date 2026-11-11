import { describe, expect, it, vi } from "vitest";
import { billsCollection } from "./bills";
import type { CollectionSource } from "./source";

describe("bills repository", () => {
  it("opens bills on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = billsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bills");
    expect(handle).toEqual({ name: "bills" });
  });
});
