import { describe, expect, it, vi } from "vitest";
import { ticketsCollection } from "./tickets";
import type { CollectionSource } from "./source";

describe("tickets repository", () => {
  it("opens tickets on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ticketsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("tickets");
    expect(handle).toEqual({ name: "tickets" });
  });
});
