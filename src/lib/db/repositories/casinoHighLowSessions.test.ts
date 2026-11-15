import { describe, expect, it, vi } from "vitest";
import { casinoHighLowSessionsCollection } from "./casinoHighLowSessions";
import type { CollectionSource } from "./source";

describe("casinoHighLowSessions repository", () => {
  it("opens casinoHighLowSessions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = casinoHighLowSessionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("casinoHighLowSessions");
    expect(handle).toEqual({ name: "casinoHighLowSessions" });
  });
});
