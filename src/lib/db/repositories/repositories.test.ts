import { describe, expect, it, vi } from "vitest";
import { bondsCollection } from "./bonds";
import { centralBanksCollection } from "./centralBanks";
import { federalBudgetCollection } from "./federalBudget";
import { financialTxLogCollection } from "./financialTxLog";
import type { CollectionSource } from "./source";

function recordingSource() {
  const collection = vi.fn((name: string) => ({ name }));
  return { source: { collection } as unknown as CollectionSource, collection };
}

describe("money repositories", () => {
  it.each([
    ["federalBudget", federalBudgetCollection],
    ["bonds", bondsCollection],
    ["centralBanks", centralBanksCollection],
    ["financialTxLog", financialTxLogCollection],
  ] as const)("opens %s on the source it is given", (name, open) => {
    const { source, collection } = recordingSource();
    const handle = open(source);
    expect(collection).toHaveBeenCalledTimes(1);
    expect(collection).toHaveBeenCalledWith(name);
    expect(handle).toEqual({ name });
  });
});
