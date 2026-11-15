/** Shared gating for the US modern packs. */
export const US_ONLY = { requiresCountryIds: ["US"], cooldown: [48, 96] } as const;
export const US_2020S = { ...US_ONLY, minYear: 2027, maxYear: 2029 } as const;
export const US_2030S = { ...US_ONLY, minYear: 2030, maxYear: 2039 } as const;
export const US_2040S = { ...US_ONLY, minYear: 2040, maxYear: 2049 } as const;
export const US_REGIONAL = { ...US_ONLY, minYear: 2027 } as const;
