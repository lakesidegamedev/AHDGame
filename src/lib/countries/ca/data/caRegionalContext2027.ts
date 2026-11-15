/**
 * Canada 2027 per-province lean offsets, fitted so each province's census
 * electorate reproduces its 2025 federal vote (caFederalVote2025.ts). Generated
 * by scripts/seeds/fit-ca-regional-context-2027.ts; regenerate rather than edit.
 */
export const caRegionalContext2027: Record<string, { economicLean: number; socialLean: number }> = {
  CA_AB: {
    economicLean: 1.9,
    socialLean: 0.88,
  },
  CA_BC: {
    economicLean: 0.78,
    socialLean: -0.32,
  },
  CA_MB: {
    economicLean: 0.98,
    socialLean: -0.23,
  },
  CA_NB: {
    economicLean: 0.26,
    socialLean: -0.99,
  },
  CA_NL: {
    economicLean: 0.08,
    socialLean: -1.18,
  },
  CA_NS: {
    economicLean: -0.05,
    socialLean: -1.28,
  },
  CA_NT: {
    economicLean: 0.24,
    socialLean: -0.96,
  },
  CA_NU: {
    economicLean: 0.74,
    socialLean: -0.84,
  },
  CA_ON: {
    economicLean: 0.68,
    socialLean: -0.4,
  },
  CA_PE: {
    economicLean: -0.14,
    socialLean: -1.38,
  },
  CA_QC: {
    economicLean: 0.5,
    socialLean: -0.72,
  },
  CA_SK: {
    economicLean: 1.9,
    socialLean: 0.72,
  },
  CA_YT: {
    economicLean: 0.35,
    socialLean: -0.74,
  },
};
