import { describe, expect, it, vi } from "vitest";
import { reservePoolTransferCommandsCollection } from "./reservePoolTransferCommands";
import type { CollectionSource } from "./source";

describe("reservePoolTransferCommands repository", () => {
  it("opens reservePoolTransferCommands on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = reservePoolTransferCommandsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("reservePoolTransferCommands");
    expect(handle).toEqual({ name: "reservePoolTransferCommands" });
  });
});
