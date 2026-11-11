import { describe, expect, it, vi } from "vitest";
import { partyAgendasCollection } from "./partyAgendas";
import type { CollectionSource } from "./source";

describe("partyAgendas repository", () => {
  it("opens partyAgendas on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = partyAgendasCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("partyAgendas");
    expect(handle).toEqual({ name: "partyAgendas" });
  });
});
