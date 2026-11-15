import { describe, expect, it, vi } from "vitest";
import { ledgerTurnoverByTurnCollection } from "./ledgerTurnoverByTurn";
import type { CollectionSource } from "./source";

describe("ledgerTurnoverByTurn repository", () => {
  it("opens ledgerTurnoverByTurn on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ledgerTurnoverByTurnCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ledgerTurnoverByTurn");
    expect(handle).toEqual({ name: "ledgerTurnoverByTurn" });
  });
});
