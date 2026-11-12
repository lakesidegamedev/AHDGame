import { describe, it, expect } from "vitest";
import { subsidiaryIssuanceBlockReason } from "./issuanceGuard";

describe("subsidiaryIssuanceBlockReason", () => {
  it("allows issuance for a non-subsidiary corp (no marker)", () => {
    expect(subsidiaryIssuanceBlockReason({})).toBeNull();
  });

  it("blocks issuance for a formalized subsidiary", () => {
    const reason = subsidiaryIssuanceBlockReason({ subsidiaryFormalizedAtTurn: 100 });
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/formalized subsidiary/i);
  });
});
