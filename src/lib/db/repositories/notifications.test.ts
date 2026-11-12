import { describe, expect, it, vi } from "vitest";
import { notificationsCollection } from "./notifications";
import type { CollectionSource } from "./source";

describe("notifications repository", () => {
  it("opens notifications on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = notificationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("notifications");
    expect(handle).toEqual({ name: "notifications" });
  });
});
