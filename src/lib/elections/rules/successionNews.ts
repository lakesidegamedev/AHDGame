/**
 * Wire copy for the steps of an executive succession. Plain data in, plain
 * data out: the shell posts it as a system news item.
 */

export type SuccessionNewsEvent = "vacancy" | "overdue" | "election_opened" | "seated";

export interface SuccessionNewsInput {
  event: SuccessionNewsEvent;
  countryName: string;
  /** Executive office key, for example "president" or "primeMinister". */
  office: string;
  /** Who acts while the office is empty; used for the vacancy item. */
  actingLabel?: string;
  /** Name of the person seated; used for the seated item. */
  holderName?: string;
  /** Turns the special election keeps its filing window open. */
  filingTurns?: number;
}

const OFFICE_NOUN: Readonly<Record<string, string>> = {
  president: "presidency",
  primeMinister: "premiership",
  premier: "premiership",
  chancellor: "chancellorship",
  taoiseach: "office of Taoiseach",
  generalSecretary: "general secretaryship",
  firstSecretary: "first secretaryship",
};

export function officeNoun(office: string): string {
  return OFFICE_NOUN[office] ?? `office of ${office}`;
}

export function buildSuccessionNews(input: SuccessionNewsInput): {
  title: string;
  content: string;
} {
  const noun = officeNoun(input.office);
  const place = input.countryName;
  switch (input.event) {
    case "vacancy":
      return {
        title: `${place}: ${noun} vacant`,
        content: `The ${noun} of ${place} is vacant.${
          input.actingLabel ? ` ${input.actingLabel} is acting until it is filled.` : ""
        }`,
      };
    case "overdue":
      return {
        title: `${place}: ${noun} still vacant`,
        content: `The ${noun} of ${place} is still vacant past its deadline.`,
      };
    case "election_opened":
      return {
        title: `${place}: special presidential election called`,
        content: `A special presidential election has been called in ${place} to fill the vacant ${noun}.${
          input.filingTurns ? ` Candidates may file for the next ${input.filingTurns} turns.` : ""
        }`,
      };
    case "seated":
      return {
        title: `${place}: new ${noun} holder`,
        content: input.holderName
          ? `${input.holderName} takes the ${noun} of ${place}.`
          : `A new holder takes the ${noun} of ${place}.`,
      };
  }
}
