import { describe, expect, it, vi } from "vitest";
import { collectiveAgreementsCollection } from "./collectiveAgreements";
import type { CollectionSource } from "./source";

describe("collectiveAgreements repository", () => {
  it("opens collectiveAgreements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = collectiveAgreementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("collectiveAgreements");
    expect(handle).toEqual({ name: "collectiveAgreements" });
  });
});
