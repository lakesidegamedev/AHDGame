import { expect, it } from "vitest";
import {
  fmtMoneyAbs,
  fmtMoneyM,
} from "@/app/country/[code]/executive/cabinet/[positionId]/office/components/formatMoney";
import { formatAmount, formatRate } from "@/components/forex/formatters";
import { fmtMoney } from "@/components/party/hq/formatters";
import { formatCurrencyCodeAmount } from "./formatCurrencyCodeAmount";
import { formatNativeFaceAmount } from "@/app/centralbank/[currency]/components/centralBankUtils";

it.each([
  [999999.5, "$1,000,000"],
  [1000000, "$1M"],
  [-1500000000, "$-1.5B"],
  [1000000000000, "$1.00T"],
  [-0.25, "$-0"],
  [Infinity, "$InfinityT"],
  [NaN, "$NaN"],
] as const)("preserves cabinet precision and sign placement for %s", (value, expected) => {
  expect(fmtMoneyAbs("$", value)).toBe(expected);
  expect(fmtMoneyM("$", value / 1e6)).toBe(expected);
});

it.each([
  [999.995, "1,000"],
  [1000, "1.0K"],
  [1000000, "1.00M"],
  [-1000000, "-1,000,000"],
  [NaN, "NaN"],
  [Infinity, "InfinityM"],
] as const)("preserves forex amount thresholds for %s", (value, expected) => {
  expect(formatAmount(value)).toBe(expected);
});

it.each([
  [9.99999, "10.0000"],
  [10, "10.00"],
  [-10, "-10.0000"],
  [NaN, "NaN"],
] as const)("preserves forex rate precision for %s", (value, expected) => {
  expect(formatRate(value)).toBe(expected);
});

it("keeps distinct HQ, ad, and central-bank face amount contracts", () => {
  expect(fmtMoney(-1500000)).toBe("$-1500000");
  expect(fmtMoney(1000000)).toBe("$1.0M");
  expect(formatCurrencyCodeAmount(1234.567, "GBP")).toBe("1,234.567 GBP");
  expect(formatNativeFaceAmount(-1234.5, "JPY")).toBe("¥-1,234");
  expect(formatNativeFaceAmount(1234.5, "GBP")).toBe("£1,234.50");
  expect(formatNativeFaceAmount(1234.5, "RUB")).toBe("₽1,234.50");
});
