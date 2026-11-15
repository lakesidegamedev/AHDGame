import { describe, expect, it, vi } from "vitest";
import { unifiedOidcFlowsCollection } from "./unifiedOidcFlows";
import type { CollectionSource } from "./source";

describe("unifiedOidcFlows repository", () => {
  it("opens unifiedOidcFlows on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = unifiedOidcFlowsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("unifiedOidcFlows");
    expect(handle).toEqual({ name: "unifiedOidcFlows" });
  });
});
