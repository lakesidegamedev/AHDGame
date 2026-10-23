import { describe, expect, it } from "vitest";
import { redactPrivateCorporation } from "@/lib/corporations/redaction";
import { ObjectId } from "mongodb";
import { resolveCorpDisplayCurrency } from "./resolveCorpDisplayCurrency";

describe("resolveCorpDisplayCurrency", () => {
  it("prefers an explicit liquidCurrencyCode", () => {
    expect(resolveCorpDisplayCurrency({ liquidCurrencyCode: "JPY", countryId: "US" })).toBe("JPY");
  });

  it("falls back to the country home currency when the stamp is missing", () => {
    expect(resolveCorpDisplayCurrency({ countryId: "JP" })).toBe("JPY");
    expect(resolveCorpDisplayCurrency({ liquidCurrencyCode: null, countryId: "UK" })).toBe("GBP");
  });

  it("returns undefined when neither stamp nor country yields a code", () => {
    expect(resolveCorpDisplayCurrency({})).toBeUndefined();
  });

  it("after private redaction, JP profit still resolves to JPY for FX (not raw anchor)", () => {
    const dailyProfitLocal = 176_823_856_821; // JPY, ticket #1612 repro scale
    const perTurnLocal = dailyProfitLocal / 24;
    const jpyPerAnchor = 136.63;

    const redacted = redactPrivateCorporation({
      _id: new ObjectId(),
      name: "Asian Broadcasting Company",
      type: "media",
      isPrivate: true,
      countryId: "JP",
      liquidCapital: 1,
      liquidCurrencyCode: "JPY",
      sharePrice: 1,
    } as never);

    const code = resolveCorpDisplayCurrency({
      liquidCurrencyCode: (redacted as { liquidCurrencyCode?: string }).liquidCurrencyCode,
      countryId: (redacted as { countryId?: string }).countryId,
    });
    expect(code).toBe("JPY");

    // Same identity path the UI used when code was missing — that would show ~₳7.4B.
    const wrongAsAnchor = perTurnLocal;
    const correctAnchor = perTurnLocal / jpyPerAnchor;
    expect(wrongAsAnchor).toBeGreaterThan(7e9);
    expect(correctAnchor).toBeGreaterThan(50e6);
    expect(correctAnchor).toBeLessThan(60e6);
    // With the retained code, callers convert local → anchor via FX, not identity.
    expect(perTurnLocal / (code === "JPY" ? jpyPerAnchor : 1)).toBeCloseTo(correctAnchor, 0);
  });

  it("country fallback alone still yields JPY when stamp was stripped", () => {
    expect(resolveCorpDisplayCurrency({ liquidCurrencyCode: undefined, countryId: "JP" })).toBe(
      "JPY"
    );
  });
});
