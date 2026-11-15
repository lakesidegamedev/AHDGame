import { describe, expect, it, vi } from "vitest";
import { migrationsCollection } from "./migrations";
import type { CollectionSource } from "./source";

describe("migrations repository", () => {
  it("opens migrations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = migrationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("migrations");
    expect(handle).toEqual({ name: "migrations" });
  });
});
