/** Game-calibrated preferences, not estimates of real-world demographic opinions. */
export function familyApprovalAffinities(
  familyId: string,
  domainAffinities: Readonly<Record<string, number>>
): Record<string, number> {
  const result = { ...domainAffinities };
  // These families explicitly redistribute household resources. Never inherit an
  // income table that rewards high earners but is indifferent to low earners.
  if (["L01", "L02", "L23", "L24", "L38"].includes(familyId)) {
    const prefix = Object.keys(result).some((key) => key.startsWith("wealth:"))
      ? "wealth"
      : "income";
    result[`${prefix}:low`] = -30;
    result[`${prefix}:middle`] = -15;
    result[`${prefix}:high`] = 15;
  }
  if (familyId === "L38") {
    for (const key of Object.keys(result)) {
      if (key === "age:mid") result[key] = -25;
      if (key === "age:mature") result[key] = -10;
      if (key === "age:young") result[key] = -15;
      if (key === "age:senior") result[key] = 0;
    }
  }
  if (familyId === "L51") {
    // Civil/social preferences differ from the desire for general health access.
    // Use only available age/education/urbanization buckets; do not invent a
    // religion dimension or infer abortion preferences from ethnicity or income.
    for (const key of Object.keys(result)) {
      const preferences: Readonly<Record<string, number>> = {
        "age:young": -15,
        "age:mid": -8,
        "age:mature": 4,
        "age:senior": 10,
        "education:degree_plus": -15,
        "education:university": -15,
        "education:graduate": -15,
        "education:college": -8,
        "education:no_college": 5,
        "education:no_qualifications": 5,
        "education:high_school": 5,
        "education:gcse_equivalent": 3,
        "education:vocational": 2,
        "urbanization:urban": -10,
        "urbanization:rural": 8,
      };
      result[key] = preferences[key] ?? 0;
    }
  }
  return result;
}
