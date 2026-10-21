import { describe, expect, it } from "vitest";
import {
  CONTRACT_CANCEL_NOTICE_MAX_TURNS,
  CONTRACT_CANCEL_NOTICE_TURNS,
  contractCancelEffectiveTurn,
} from "./supplyAgreement";

describe("contractCancelEffectiveTurn", () => {
  it("gives open-ended contracts the flat notice", () => {
    expect(contractCancelEffectiveTurn(100, undefined)).toBe(100 + CONTRACT_CANCEL_NOTICE_TURNS);
  });

  it("scales notice with the term left on a fixed-term contract", () => {
    expect(contractCancelEffectiveTurn(100, 160)).toBe(115);
  });

  it("never asks less than the flat notice", () => {
    expect(contractCancelEffectiveTurn(100, 108)).toBe(104);
  });

  it("caps notice at a financial day", () => {
    expect(contractCancelEffectiveTurn(100, 292)).toBe(100 + CONTRACT_CANCEL_NOTICE_MAX_TURNS);
  });

  it("never runs past the contract's own expiry", () => {
    expect(contractCancelEffectiveTurn(100, 102)).toBe(102);
    expect(contractCancelEffectiveTurn(100, 90)).toBe(100);
  });
});
