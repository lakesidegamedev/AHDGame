import { describe, expect, it, vi } from "vitest";
import { depositInsuranceFundsCollection } from "./depositInsuranceFunds";
import type { CollectionSource } from "./source";

describe("depositInsuranceFunds repository", () => {
  it("opens depositInsuranceFunds on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = depositInsuranceFundsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("depositInsuranceFunds");
    expect(handle).toEqual({ name: "depositInsuranceFunds" });
  });
});
