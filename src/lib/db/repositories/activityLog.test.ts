import { describe, expect, it, vi } from "vitest";
import { activityLogCollection } from "./activityLog";
import type { CollectionSource } from "./source";

describe("activityLog repository", () => {
  it("opens activityLog on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = activityLogCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("activityLog");
    expect(handle).toEqual({ name: "activityLog" });
  });
});
