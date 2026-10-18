/** Group a face amount and append its code, without currency conversion. */
export function formatCurrencyCodeAmount(n: number, code: string) {
  return `${n.toLocaleString("en-US")} ${code}`;
}
