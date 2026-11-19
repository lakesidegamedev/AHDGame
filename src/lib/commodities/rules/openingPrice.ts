/** An opening quote leaves the commodity basis used by physical recipes intact. */
export function getPresetCommodityOpeningPrice(
  commodity: string,
  preset: string | undefined,
  basePrice: number
): number {
  return preset === "2027-default" && commodity === "iron" ? 95 : basePrice;
}
