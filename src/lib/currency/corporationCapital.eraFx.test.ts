import { describe, it, expect } from "vitest";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { eraRateForCurrency } from "@/lib/constants/currencies";
import { writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import {
  fxRateForSectorHostFromMap,
  resolveSectorHostCurrencyCode,
  withAuthoredEraRates,
} from "@/lib/currency/corporationCapital";
import { buildSectorCurrencyRestatement } from "@/lib/corporations/queries/corporationDetail/currencyRestatement";

const PRESET = "2027-default";
const TURNS_PER_DAY = 24;

/** Live rows as the 2027 world carries them: euro members share one EUR row, FRF/ITL have none. */
function liveRows(): Map<CurrencyCode, number> {
  return new Map<CurrencyCode, number>([
    ["USD", 1],
    ["EUR", 0.9577],
  ]);
}

const usCorp = { countryId: "US", liquidCurrencyCode: "USD" } as Corporation;

describe("withAuthoredEraRates", () => {
  it("fills era codes that have no live row from the authored table", () => {
    const rates = withAuthoredEraRates(liveRows(), PRESET);
    expect(rates.get("ITL")).toBe(eraRateForCurrency("ITL", PRESET));
    expect(rates.get("FRF")).toBe(eraRateForCurrency("FRF", PRESET));
    expect(rates.get("ITL")).toBeCloseTo(833, 6);
    expect(rates.get("FRF")).toBeCloseTo(4.2, 6);
  });

  it("never overwrites a live rate", () => {
    const live = liveRows();
    live.set("FRF", 6.5);
    const rates = withAuthoredEraRates(live, PRESET);
    expect(rates.get("FRF")).toBe(6.5);
    expect(rates.get("EUR")).toBe(0.9577);
  });
});

describe("sector money restatement for foreign-owned era-currency sectors", () => {
  // The engine stores `plantsPnl.revenue` as daily anchor revenue written into the
  // sector's host currency at the engine's rate (settleSectorAccounts `daily`).
  function engineStoredRevenue(
    sector: Pick<CorporateSector, "countryId">,
    receiptAnchorPerTurn: number
  ): number {
    const engineMap = withAuthoredEraRates(liveRows(), PRESET);
    return writeCorpEconomicLocal(
      receiptAnchorPerTurn * TURNS_PER_DAY,
      resolveSectorHostCurrencyCode(sector, usCorp),
      fxRateForSectorHostFromMap(sector, usCorp, engineMap)
    );
  }

  it.each([
    ["IT", 1778.55, 833],
    ["FR", 51809, 4.2],
  ])(
    "US corp with a %s sector reads back the receipt anchor revenue x 24",
    (countryId, receipt, ratio) => {
      const sector = { countryId } as Pick<CorporateSector, "countryId">;
      const stored = engineStoredRevenue(sector, receipt);
      expect(stored / (receipt * TURNS_PER_DAY)).toBeCloseTo(ratio, 6);

      // A reader that builds its map the way the company page does: live rows plus
      // the shared fallback.
      const { toAnchor } = buildSectorCurrencyRestatement(
        usCorp,
        withAuthoredEraRates(liveRows(), PRESET)
      );
      expect(toAnchor(stored, sector)).toBeCloseTo(receipt * TURNS_PER_DAY, 4);
    }
  );

  it("a live-only map refuses missing historical-host quotes", () => {
    const sector = { countryId: "IT" } as Pick<CorporateSector, "countryId">;
    const stored = engineStoredRevenue(sector, 1778.55);
    const { toAnchor } = buildSectorCurrencyRestatement(usCorp, liveRows());
    expect(() => toAnchor(stored, sector)).toThrow(/Exchange rate unavailable/);
  });

  it("leaves domestic and live-row hosts untouched", () => {
    const { toAnchor } = buildSectorCurrencyRestatement(
      usCorp,
      withAuthoredEraRates(liveRows(), PRESET)
    );
    expect(toAnchor(1000, { countryId: "US" } as Pick<CorporateSector, "countryId">)).toBeCloseTo(
      1000,
      6
    );
  });
});
