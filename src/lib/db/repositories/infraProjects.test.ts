import { describe, expect, it, vi } from "vitest";
import { infraProjectsCollection } from "./infraProjects";
import type { CollectionSource } from "./source";

describe("infraProjects repository", () => {
  it("opens infraProjects on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = infraProjectsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("infraProjects");
    expect(handle).toEqual({ name: "infraProjects" });
  });
});
