import { formatFundsCompact1dp } from "@/lib/utils/formattersCore";

/**
 * Rewrites the wording of country briefs posted before the bond and austerity
 * sentences were corrected. Pure: the same stored text and currency always give
 * the same repaired text, and text already in the current wording is returned
 * unchanged.
 */

const OLD_BOND = / Its nearest bond pays (\d+(?:\.\d+)?)% and trades at (\d+(?:\.\d+)?)\./g;

const OLD_AUSTERITY =
  /^(.+?) will consolidate its budget by (\d+(?:\.\d+)?)% of GDP in fiscal year (\d+): tax rises of (\d+(?:\.\d+)?)% of GDP and spending cuts of (\d+(?:\.\d+)?)% of GDP\. Expect a weaker economy and a hit to the government's approval, and a stronger budget for bondholders\./;

/** Percent figures this large were a local currency amount times 100, not a share of GDP. */
const MIN_MISLABELLED_PERCENT = 1_000_000;

export function repairBriefBody(body: string, currencyCode: string | null): string {
  let text = body;
  const austerity = OLD_AUSTERITY.exec(text);
  if (austerity) {
    const [whole, name, size, year, taxPct, cutPct] = austerity;
    const tax = Number(taxPct) / 100;
    const cut = Number(cutPct) / 100;
    if (tax * 100 >= MIN_MISLABELLED_PERCENT || cut * 100 >= MIN_MISLABELLED_PERCENT) {
      const local = (amount: number) =>
        `${formatFundsCompact1dp(amount, "")} ${currencyCode ?? "in local currency"}`;
      text =
        `${name} plans a budget adjustment equal to ${size}% of GDP in fiscal year ${year}. ` +
        `The package includes ${local(tax)} in tax increases and ${local(cut)} in spending cuts. ` +
        `Expect slower growth and lower government approval.` +
        text.slice(whole.length);
    }
  }
  return text.replace(
    OLD_BOND,
    (_m, coupon: string, price: string) =>
      ` Its nearest bond has a fixed coupon of ${coupon}%, set when it was issued, and traded at ${price} when this brief was written. Several bonds can mature together; the Invest list shows live prices for each.`
  );
}
