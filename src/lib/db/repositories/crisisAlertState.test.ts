import { describe, expect, it, vi } from "vitest";
import { crisisAlertStateCollection } from "./crisisAlertState";
import type { CollectionSource } from "./source";

describe("crisisAlertState repository", () => {
  it("opens crisisAlertState on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = crisisAlertStateCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("crisisAlertState");
    expect(handle).toEqual({ name: "crisisAlertState" });
  });
});
