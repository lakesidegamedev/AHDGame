import { describe, expect, it, vi } from "vitest";
import { migrationsRunCollection } from "./migrationsRun";
import type { CollectionSource } from "./source";

describe("migrationsRun repository", () => {
  it("opens migrationsRun on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = migrationsRunCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("migrationsRun");
    expect(handle).toEqual({ name: "migrationsRun" });
  });
});
