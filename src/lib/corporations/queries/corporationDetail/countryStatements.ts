/**
 * Per-country income statements for the corporation page.
 *
 * Only lines that belong to a country are here: what its sectors earn and what
 * its sectors cost, plus the tax charged on them. Corporation-wide costs
 * (marketing, logistics, R&D, CEO pay, pensions, bond interest) have no country
 * and stay on the whole-corporation statement. Pure: plain data in, plain data
 * out, all figures daily in the corporation's currency.
 */

/** One country's sector figures, summed in the sector pass. */
export interface CountryOperatingTotals {
  sectorCount: number;
  revenue: number;
  freightIncome: number;
  /** Gross maintenance, wages included (the sector pass's basis). */
  maintenance: number;
  labor: number;
  freightCosts: number;
  growthCosts: number;
  regulatoryBurden: number;
}

/** The tax charged on one country's sectors, after any loss carryforward. */
export interface CountryTax {
  federal: number;
  state: number;
}

export interface CountryStatement {
  countryId: string;
  sectorCount: number;
  /** Includes freight income, as the main statement's gross revenue does. */
  revenue: number;
  /** The freight share of revenue, shown for reference. */
  freightIncome: number;
  /** Net of wages, as on the main statement. */
  maintenanceCosts: number;
  laborCosts: number;
  freightCosts: number;
  growthCosts: number;
  regulatoryBurden: number;
  federalTax: number;
  stateTax: number;
  /** Revenue less this country's sector costs and tax. */
  result: number;
}

const whole = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);

export function buildCountryStatements(
  operating: Record<string, CountryOperatingTotals>,
  taxByCountry: Record<string, CountryTax>
): CountryStatement[] {
  return Object.entries(operating)
    .map(([countryId, o]) => {
      const tax = taxByCountry[countryId];
      const labor = whole(o.labor);
      const row = {
        countryId,
        sectorCount: o.sectorCount,
        revenue: whole(o.revenue),
        freightIncome: whole(o.freightIncome),
        maintenanceCosts: whole(o.maintenance) - labor,
        laborCosts: labor,
        freightCosts: whole(o.freightCosts),
        growthCosts: whole(o.growthCosts),
        regulatoryBurden: whole(o.regulatoryBurden),
        federalTax: whole(tax?.federal ?? 0),
        stateTax: whole(tax?.state ?? 0),
      };
      // Freight income is already inside revenue (each sector's financial
      // revenue carries its freight credit), so it is shown, not added.
      const result =
        row.revenue -
        row.maintenanceCosts -
        row.laborCosts -
        row.freightCosts -
        row.growthCosts -
        row.regulatoryBurden -
        row.federalTax -
        row.stateTax;
      return { ...row, result };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
