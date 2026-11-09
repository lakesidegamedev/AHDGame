import { scaleDeep } from "../docScale";

/** Split amounts, keep rates and settlement dates, and rebind current program identities. */
export function splitRegionalFinance(
  source: Record<string, unknown>,
  countryId: string,
  regionId: string,
  weight: number
): Record<string, unknown> {
  const settlements = source.programSettlements as
    Record<string, Record<string, unknown>> | undefined;
  const rekey = (id: string) => id.replace(`:UK:${countryId}:`, `:${countryId}:${regionId}:`);
  return {
    ...(source.stateId !== undefined ? { stateId: regionId } : {}),
    ...(source.regionId !== undefined ? { regionId } : {}),
    ...Object.fromEntries(
      ["fundedBillCosts", "unfundedBillCosts", "chancellorAllocation"].flatMap((key) =>
        typeof source[key] === "number" ? [[key, scaleDeep(source[key], weight)]] : []
      )
    ),
    ...(settlements
      ? {
          programSettlements: Object.fromEntries(
            Object.entries(settlements).map(([id, row]) => [
              rekey(id),
              {
                ...row,
                programId: rekey(typeof row.programId === "string" ? row.programId : id),
                ...Object.fromEntries(
                  ["authorizedCost", "fundedAmount", "unfundedAmount"].flatMap((key) =>
                    typeof row[key] === "number" ? [[key, row[key] * weight]] : []
                  )
                ),
              },
            ])
          ),
        }
      : {}),
  };
}
