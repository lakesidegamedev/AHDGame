import { describe, expect, it, vi } from "vitest";
import { stateRegistrationPoolCollection } from "./stateRegistrationPool";
import type { CollectionSource } from "./source";

describe("stateRegistrationPool repository", () => {
  it("opens stateRegistrationPool on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stateRegistrationPoolCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stateRegistrationPool");
    expect(handle).toEqual({ name: "stateRegistrationPool" });
  });
});
