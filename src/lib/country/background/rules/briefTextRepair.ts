import { formatFundsCompact1dp } from "@/lib/utils/formattersCore";
import { outlookProse, ratingDirection } from "./countryBriefs";

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

const OUTLOOK_BODY =
  /^(.+?): (?:growth (-?\d+(?:\.\d+)?)%)?(?:, )?(?:inflation (-?\d+(?:\.\d+)?)%)?(?:, )?(?:debt (\d+)% of GDP)?(?:, )?(?:rated ([A-D]+))?\./;

const RATING_MOVE = /^In (.+?), (its credit rating moved from ([A-D]+) to ([A-D]+))(?:; |\.)/;

const BOND_TAIL = " Its nearest bond";

const num = (v: string | undefined): number | null => (v === undefined ? null : Number(v));

/**
 * Repairs a stored brief or news story: its headline and body together.
 * Outlooks written as a name-swapped template are rebuilt as prose from the
 * figures they carried, and a rating upgrade filed under a debt strain
 * headline becomes an upgrade story. Anything else only gets the body repair.
 */
export function repairBriefStory(
  story: { headline: string; body: string },
  currencyCode: string | null
): { headline: string; body: string } {
  let { headline, body } = story;
  const country = headline.replace(/ (outlook|debt under strain)$/, "");

  if (headline.endsWith(" outlook")) {
    const m = OUTLOOK_BODY.exec(body);
    if (m && m[1] === country && (m[2] || m[3] || m[4] || m[5])) {
      const tailAt = body.indexOf(BOND_TAIL, m[0].length);
      body =
        outlookProse({
          countryName: country,
          growth: num(m[2]),
          inflation: num(m[3]),
          debtToGdp: num(m[4]),
          creditRating: m[5] ?? null,
        }) + (tailAt >= 0 ? body.slice(tailAt) : "");
    }
  }

  if (headline.endsWith(" debt under strain")) {
    const m = RATING_MOVE.exec(body);
    if (m && (ratingDirection(m[3], m[4]) ?? 0) > 0) {
      const rest = body.slice(m[0].length);
      if (m[0].endsWith("; ")) {
        // Other strain facts remain: keep the strain story, drop the false downgrade clause.
        body = `In ${m[1]}, ${rest}`;
      } else {
        headline = `${country} upgraded to ${m[4]}`;
        const tail = rest.replace(
          /\s*Thin demand can push yields up and bond prices down\.?\s*$/,
          ""
        );
        body = `${country}'s credit rating rose from ${m[3]} to ${m[4]}. The rating does not change the fixed coupons on bonds already issued.${tail}`;
      }
    }
  }

  return { headline, body: repairBriefBody(body, currencyCode) };
}
