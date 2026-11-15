import { describe, expect, it, vi } from "vitest";
import { discordBotFundsCollection } from "./discordBotFunds";
import type { CollectionSource } from "./source";

describe("discordBotFunds repository", () => {
  it("opens discordBotFunds on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = discordBotFundsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("discordBotFunds");
    expect(handle).toEqual({ name: "discordBotFunds" });
  });
});
