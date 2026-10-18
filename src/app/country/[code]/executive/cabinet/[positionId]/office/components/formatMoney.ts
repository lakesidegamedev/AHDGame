/** Cabinet amounts in base currency units; negative signs follow the symbol. */
export function fmtMoneyAbs(sym: string, v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${sym}${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sym}${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sym}${(v / 1e6).toFixed(0)}M`;
  return `${sym}${Math.round(v).toLocaleString("en-US")}`;
}

/** Cabinet amounts stored in millions use the same display after scaling. */
export function fmtMoneyM(sym: string, millions: number): string {
  return fmtMoneyAbs(sym, millions * 1e6);
}
