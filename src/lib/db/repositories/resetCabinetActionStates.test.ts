import { describe, expect, it, vi } from "vitest";
import { resetCabinetActionStatesCollection } from "./resetCabinetActionStates";
import type { CollectionSource } from "./source";

describe("resetCabinetActionStates repository", () => {
  it("opens resetCabinetActionStates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = resetCabinetActionStatesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("resetCabinetActionStates");
    expect(handle).toEqual({ name: "resetCabinetActionStates" });
  });
});
