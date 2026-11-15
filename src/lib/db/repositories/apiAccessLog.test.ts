import { describe, expect, it, vi } from "vitest";
import { apiAccessLogCollection } from "./apiAccessLog";
import type { CollectionSource } from "./source";

describe("apiAccessLog repository", () => {
  it("opens apiAccessLog on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = apiAccessLogCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("apiAccessLog");
    expect(handle).toEqual({ name: "apiAccessLog" });
  });
});
