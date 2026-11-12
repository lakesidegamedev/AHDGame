import type { GroupBucketTable } from "@/lib/demographics/legacyGroupDrift/rules";

/** The twelve US voter groups, as the older builds projected them. */
export const US_GROUP_BUCKETS: GroupBucketTable = {
  young_renters: [
    { dim: "age", key: "young", w: 0.5 },
    { dim: "wealth", key: "low", w: 0.3 },
    { dim: "education", key: "no_college", w: 0.2 },
  ],
  evangelicals: [
    { dim: "race", key: "white", w: 0.6 },
    { dim: "education", key: "no_college", w: 0.4 },
  ],
  rural_traditionalists: [
    { dim: "education", key: "no_college", w: 0.5 },
    { dim: "race", key: "white", w: 0.3 },
    { dim: "age", key: "mature", w: 0.2 },
  ],
  union_trades: [
    { dim: "education", key: "no_college", w: 0.4 },
    { dim: "wealth", key: "low", w: 0.35 },
    { dim: "race", key: "black", w: 0.25 },
  ],
  soccer_moms: [
    { dim: "age", key: "mid", w: 0.5 },
    { dim: "wealth", key: "middle", w: 0.4 },
    { dim: "race", key: "white", w: 0.1 },
  ],
  college_liberals: [
    { dim: "education", key: "college", w: 0.4 },
    { dim: "education", key: "graduate", w: 0.3 },
    { dim: "age", key: "young", w: 0.3 },
  ],
  small_business: [
    { dim: "wealth", key: "high", w: 0.5 },
    { dim: "age", key: "mature", w: 0.3 },
    { dim: "race", key: "white", w: 0.2 },
  ],
  public_sector: [
    { dim: "education", key: "college", w: 0.4 },
    { dim: "wealth", key: "middle", w: 0.4 },
    { dim: "education", key: "graduate", w: 0.2 },
  ],
  retirees: [
    { dim: "age", key: "senior", w: 0.7 },
    { dim: "age", key: "mature", w: 0.3 },
  ],
  libertarians: [
    { dim: "race", key: "white", w: 0.4 },
    { dim: "education", key: "college", w: 0.3 },
    { dim: "wealth", key: "middle", w: 0.3 },
  ],
  new_immigrants: [
    { dim: "race", key: "hispanic", w: 0.5 },
    { dim: "race", key: "asian", w: 0.3 },
    { dim: "race", key: "other", w: 0.2 },
  ],
  secular_professionals: [
    { dim: "education", key: "graduate", w: 0.5 },
    { dim: "wealth", key: "high", w: 0.3 },
    { dim: "age", key: "mid", w: 0.2 },
  ],
};
