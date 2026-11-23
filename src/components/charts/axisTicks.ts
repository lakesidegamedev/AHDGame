import { currencySymbolSep } from "@/lib/currency/symbolSep";
import { formatFundsCompact } from "@/lib/utils/formattersCore";

function plainAmount(value: number, symbol: string, decimals: number): string {
  const sep = currencySymbolSep(symbol);
  const text = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${value < 0 ? "-" : ""}${symbol}${sep}${text}`;
}

/**
 * Tick label formatter for a value axis. Compact labels ("464K") are used when
 * every tick stays distinct; a narrow range falls back to whole numbers and then
 * to decimals, so adjacent ticks never share a label.
 */
export function axisTickFormatter(values: number[], symbol: string): (value: number) => string {
  const distinct = (format: (v: number) => string) =>
    new Set(values.map(format)).size === values.length;
  const compact = (v: number) => formatFundsCompact(Math.round(v), symbol);
  if (distinct(compact)) return compact;
  for (const decimals of [0, 1, 2]) {
    const format = (v: number) => plainAmount(v, symbol, decimals);
    if (distinct(format)) return format;
  }
  return (v: number) => plainAmount(v, symbol, 2);
}
