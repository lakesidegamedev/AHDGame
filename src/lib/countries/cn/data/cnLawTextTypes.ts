export type CnLawLevelText = readonly [name: string, description: string];

/** Title, summary, enacted level on day one, then the five level texts. */
export type CnLawText = readonly [
  title: string,
  description: string,
  baselineLevel: 0 | 1 | 2 | 3 | 4,
  levels: readonly [CnLawLevelText, CnLawLevelText, CnLawLevelText, CnLawLevelText, CnLawLevelText],
];
