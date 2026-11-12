import { describe, expect, it, vi } from "vitest";
import { botApiRequestLogCollection } from "./botApiRequestLog";
import type { CollectionSource } from "./source";

describe("botApiRequestLog repository", () => {
  it("opens botApiRequestLog on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = botApiRequestLogCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("botApiRequestLog");
    expect(handle).toEqual({ name: "botApiRequestLog" });
  });
});
