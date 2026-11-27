/** Clear optional revenue fields owned by a different fiscal model. */
export function foreignRegionalRevenueFields(model: "UK" | "RU"): Record<string, ""> {
  return {
    residentTaxRevenue: "",
    fixedAssetTaxRevenue: "",
    nationalGrant: "",
    incomeTaxShare: "",
    vatShare: "",
    federalEqualizationGrant: "",
    tradeTaxRevenue: "",
    eitShare: "",
    centralTransferGrant: "",
    resourceTaxRevenue: "",
    businessTaxRevenue: "",
    ...{ UK: { unionGrant: "" as const }, RU: {} }[model],
  };
}
