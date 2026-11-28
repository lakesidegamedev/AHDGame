/** Broad home-country exposure wins over a global broad fund; picked stocks are ineligible. */
export function chooseSchemeFund<
  T extends {
    status: string;
    kind: string;
    mandate?: { mode?: string };
    scope?: string;
    countryId?: string | null;
  },
>(funds: T[], countryId: string): T | null {
  const eligible = funds.filter(
    (fund) =>
      fund.status === "active" && fund.kind === "broad" && fund.mandate?.mode !== "picked_stocks"
  );
  return (
    eligible.find((fund) => fund.scope === "country" && fund.countryId === countryId) ??
    eligible.find((fund) => fund.scope === "global") ??
    null
  );
}
