/**
 * Display labels for the demographic dimensions.
 *
 * MUST STAY IMPORT-FREE. `GranularPollPanel` is a client component that needs
 * only these label strings; any value import here would pull the demographics
 * tables (region overrides, `shiftRegion`) into the client bundle for a handful
 * of strings. A sibling module with nothing behind it is the fix.
 */
/**
 * Human-readable labels for each Layer-1 demographic sub-group.
 */
export const DEMOGRAPHIC_LABELS: Record<string, Record<string, string>> = {
  race: { white: "White", black: "Black", hispanic: "Hispanic", asian: "Asian", other: "Other" },
  age: {
    young: "Young (18–34)",
    mid: "Middle-Aged (35–49)",
    mature: "Mature (50–64)",
    senior: "Senior (65+)",
  },
  education: { no_college: "No College", college: "College Degree", graduate: "Graduate Degree" },
  wealth: { low: "Low Income", middle: "Middle Income", high: "High Income" },
};
