export type DeLawLevelText = readonly [name: string, description: string];

/** Title, summary, enacted level on day one, then the five level texts. */
export type DeLawText = readonly [
  title: string,
  description: string,
  baselineLevel: 0 | 1 | 2 | 3 | 4,
  levels: readonly [
    DeLawLevelText,
    DeLawLevelText,
    DeLawLevelText,
    DeLawLevelText,
    DeLawLevelText,
  ],
];
