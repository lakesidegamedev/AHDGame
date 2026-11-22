/**
 * Profit per unit sold to outside buyers, from one settled receipt.
 *
 * Output handed to the company's own sites is not a sale: no buyer paid for it,
 * so it carries its own share of the bill and is reported on its own line.
 * The units sold outside carry the rest, including the share made but unsold.
 *
 * Pure: receipt figures in, per-unit figures out (same currency basis as the receipt).
 */
export interface OutsideSalesReceipt {
  producedUnits?: number;
  soldUnits?: number;
  revenue?: number;
  inputsConsumed?: number;
  labourPaid?: number;
  labourArrears?: number;
  otherOperatingPaid?: number;
  otherOperatingArrears?: number;
  internalSupplyCharge?: number;
  products?: ReadonlyArray<{
    internalDeliveredUnits?: number;
    askingUnitPrice?: number | null;
  }>;
}

export interface OutsideSalesUnitEconomics {
  /** Revenue per unit sold outside; null when nothing sold outside. */
  unitPrice: number | null;
  unitMaterials: number | null;
  unitWages: number | null;
  unitSite: number | null;
  /** What the company's own sites billed this sector for inputs, per unit sold outside. */
  unitOwnSiteCharge: number | null;
  /** unitPrice minus every cost above; null when nothing sold outside. */
  profitPerUnit: number | null;
  /** Units handed to the company's own sites. */
  ownSiteUnits: number;
  /** Those units at the plant's asking price. */
  ownSiteValueAtAsk: number;
}

function finite(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

export function outsideSalesUnitEconomics(receipt: OutsideSalesReceipt): OutsideSalesUnitEconomics {
  const sold = Math.max(0, finite(receipt.soldUnits));
  let ownSiteUnits = 0;
  let ownSiteValueAtAsk = 0;
  for (const p of receipt.products ?? []) {
    const u = Math.max(0, finite(p.internalDeliveredUnits));
    ownSiteUnits += u;
    ownSiteValueAtAsk += u * Math.max(0, finite(p.askingUnitPrice));
  }
  if (!(sold > 0)) {
    return {
      unitPrice: null,
      unitMaterials: null,
      unitWages: null,
      unitSite: null,
      unitOwnSiteCharge: null,
      profitPerUnit: null,
      ownSiteUnits,
      ownSiteValueAtAsk,
    };
  }
  const made = Math.max(finite(receipt.producedUnits), sold + ownSiteUnits);
  // Share of everything made that sold outside or went unsold.
  const outsideShare = made > 0 ? (made - ownSiteUnits) / made : 1;
  const perSold = (bill: number) => (bill * outsideShare) / sold;
  const unitPrice = finite(receipt.revenue) / sold;
  const unitMaterials = perSold(finite(receipt.inputsConsumed));
  const unitWages = perSold(finite(receipt.labourPaid) + finite(receipt.labourArrears));
  const unitSite = perSold(
    finite(receipt.otherOperatingPaid) + finite(receipt.otherOperatingArrears)
  );
  const unitOwnSiteCharge = perSold(Math.max(0, finite(receipt.internalSupplyCharge)));
  return {
    unitPrice,
    unitMaterials,
    unitWages,
    unitSite,
    unitOwnSiteCharge,
    profitPerUnit: unitPrice - unitMaterials - unitWages - unitSite - unitOwnSiteCharge,
    ownSiteUnits,
    ownSiteValueAtAsk,
  };
}
