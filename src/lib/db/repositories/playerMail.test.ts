import { describe, expect, it, vi } from "vitest";
import { playerMailCollection } from "./playerMail";
import type { CollectionSource } from "./source";

describe("playerMail repository", () => {
  it("opens playerMail on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = playerMailCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("playerMail");
    expect(handle).toEqual({ name: "playerMail" });
  });
});
