import { describe, expect, it, vi } from "vitest";
import { nationalManpowerCollection } from "./nationalManpower";
import type { CollectionSource } from "./source";

describe("nationalManpower repository", () => {
  it("opens nationalManpower on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalManpowerCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalManpower");
    expect(handle).toEqual({ name: "nationalManpower" });
  });
});
