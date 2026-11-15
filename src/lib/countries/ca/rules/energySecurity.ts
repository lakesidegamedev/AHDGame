/**
 * Canadian energy exposure combines same-fuel imports and commercial stock cover.
 * canadianEnergySecurity weights gas and finished petroleum by consumption shares
 * and retains the source year and modeling limits on its observation.
 */
import type { OpeningMetricObservation } from "@/lib/resetMetrics/rules/openingObservation";
import { fuelExposureRisk } from "@/lib/resetMetrics/rules/provisionalFuelOpening";

export interface CanadianEnergyInput {
  referenceYear: number;
  sources: Readonly<Record<string, string>>;
  primaryProductionShares: Readonly<Record<string, number>>;
  fuels: readonly {
    id: string;
    unit: string;
    finalEnergySharePercent: number;
    annualImports: number;
    annualDomesticUse: number;
    decemberClosingCommercialStock: number;
  }[];
}

/** Energy-carrier diversity and commercial cover, not a statutory emergency-stock test. */
export function canadianEnergySecurity(input: CanadianEnergyInput): OpeningMetricObservation {
  if (!Number.isSafeInteger(input.referenceYear) || input.referenceYear < 1900)
    throw new Error("Invalid Canadian energy reference year");
  const days =
    input.referenceYear % 4 === 0 &&
    (input.referenceYear % 100 !== 0 || input.referenceYear % 400 === 0)
      ? 366
      : 365;
  const shares = Object.values(input.primaryProductionShares);
  if (
    !shares.length ||
    shares.some((v) => !Number.isFinite(v) || v < 0) ||
    Math.abs(shares.reduce((s, v) => s + v, 0) - 100) > 0.2 ||
    input.fuels.length !== 2 ||
    new Set(input.fuels.map((f) => f.id)).size !== 2
  )
    throw new Error("Incomplete Canadian energy source coverage");
  const totalShares = shares.reduce((s, v) => s + v, 0);
  const sourceDiversity = 100 * (1 - shares.reduce((s, v) => s + (v / totalShares) ** 2, 0));
  const coveredShare = input.fuels.reduce((s, f) => s + f.finalEnergySharePercent, 0);
  if (!(coveredShare > 0 && coveredShare <= 100)) throw new Error("Invalid Canadian fuel coverage");
  const details = input.fuels.map((fuel) => {
    if (
      (fuel.id !== "natural_gas" && fuel.id !== "finished_petroleum") ||
      fuel.unit !== (fuel.id === "natural_gas" ? "GJ" : "m3") ||
      !Number.isFinite(fuel.annualDomesticUse) ||
      fuel.annualDomesticUse <= 0 ||
      !Number.isFinite(fuel.annualImports) ||
      fuel.annualImports < 0 ||
      !Number.isFinite(fuel.decemberClosingCommercialStock) ||
      fuel.decemberClosingCommercialStock < 0 ||
      !Number.isFinite(fuel.finalEnergySharePercent) ||
      fuel.finalEnergySharePercent <= 0
    )
      throw new Error(`Invalid Canadian fuel ledger ${fuel.id}`);
    const importsPercent = Math.min(100, (100 * fuel.annualImports) / fuel.annualDomesticUse);
    const bufferCoverDays = (days * fuel.decemberClosingCommercialStock) / fuel.annualDomesticUse;
    const risk = fuelExposureRisk({
      importExposurePercent: importsPercent,
      bufferCoverDays,
      sourceDiversity,
    });
    if (risk === null) throw new Error(`Invalid Canadian fuel-risk inputs ${fuel.id}`);
    return { ...fuel, importsPercent, bufferCoverDays, risk };
  });
  return {
    metricId: "58",
    path: "security.energySecurity",
    owner: "energy",
    status: "proxy",
    value: details.reduce((s, f) => s + (f.risk * f.finalEnergySharePercent) / coveredShare, 0),
    source: `Statistics Canada ${input.referenceYear} gas and finished-petroleum balances, inventories and primary-production mix; ${Object.values(input.sources).join("; ")}`,
    note: `Canadian game risk index from Canadian observations, held forward from ${input.referenceYear}. ${details.map((f) => `${f.id}: gross imports ${f.importsPercent.toFixed(2)}% of domestic use, December commercial inventory ${f.bufferCoverDays.toFixed(2)} days of annual-average domestic use`).join("; ")}. Source diversity is the Simpson diversity of Canada's published primary-production fuel shares (${sourceDiversity.toFixed(2)}/100), not import-country diversity. Gas and finished petroleum represent ${coveredShare.toFixed(1)}% of final energy consumption; electricity is measured separately by grid reliability. Crude-feedstock, condensate, and other fuels are outside this indicator's stock-cover boundary. Commercial stocks are not public emergency reserves; the shared 90-day risk-scale normalization is not an IEA stockholding obligation. This is a modeled composite, not an official Statistics Canada index or a verified emergency drawdown capability.`,
  };
}
