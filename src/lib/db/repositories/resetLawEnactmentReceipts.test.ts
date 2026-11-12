import { describe, expect, it, vi } from "vitest";
import { resetLawEnactmentReceiptsCollection } from "./resetLawEnactmentReceipts";
import type { CollectionSource } from "./source";

describe("resetLawEnactmentReceipts repository", () => {
  it("opens resetLawEnactmentReceipts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = resetLawEnactmentReceiptsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("resetLawEnactmentReceipts");
    expect(handle).toEqual({ name: "resetLawEnactmentReceipts" });
  });
});
