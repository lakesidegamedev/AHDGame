import { describe, expect, it, vi } from "vitest";
import { mediaProductProjectsV1Collection } from "./mediaProductProjectsV1";
import type { CollectionSource } from "./source";

describe("mediaProductProjectsV1 repository", () => {
  it("opens mediaProductProjectsV1 on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = mediaProductProjectsV1Collection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("mediaProductProjectsV1");
    expect(handle).toEqual({ name: "mediaProductProjectsV1" });
  });
});
