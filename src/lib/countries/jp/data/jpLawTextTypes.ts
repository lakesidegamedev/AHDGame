export type JpLawLevelText = readonly [name: string, description: string];

/** Title, summary, enacted level on day one, then the five level texts. */
export type JpLawText = readonly [
  title: string,
  description: string,
  baselineLevel: 0 | 1 | 2 | 3 | 4,
  levels: readonly [JpLawLevelText, JpLawLevelText, JpLawLevelText, JpLawLevelText, JpLawLevelText],
];
