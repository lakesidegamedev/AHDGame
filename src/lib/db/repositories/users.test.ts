import { describe, expect, it, vi } from "vitest";
import { usersCollection } from "./users";
import type { CollectionSource } from "./source";

describe("users repository", () => {
  it("opens users on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = usersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("users", undefined);
    expect(handle).toEqual({ name: "users" });
  });

  it("forwards collection options", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const options = { writeConcern: { w: "majority" as const } };
    usersCollection({ collection } as unknown as CollectionSource, options);
    expect(collection).toHaveBeenCalledExactlyOnceWith("users", options);
  });
});
