/** Reviewed semantic routes. Weights divide one existing allocation, never multiply it. */
export interface RecoveryRoute {
  familyId: string;
  weight: number;
  reverse?: boolean;
}
const route = (familyId: string): RecoveryRoute[] => [{ familyId, weight: 1 }];
const political: Record<string, RecoveryRoute[]> = {
  "economy.workerSecurity.primary": route("L04"),
  "economy.productivity.primary": route("L03"),
  "infrastructure.publicHousing.primary": route("L22"),
  "infrastructure.transit.primary": route("L26"),
  "infrastructure.condition.primary": route("L25"),
  "sec.hospitalConstruction": route("L18"),
  "health.prevention.primary": route("L19"),
  "education.universalSchooling.primary": route("L10"),
  "education.teacherCorps.primary": route("L11"),
  "education.standards.primary": route("L12"),
  "education.choice.primary": [{ familyId: "L10", weight: 1, reverse: true }],
  "environment.conservation.primary": route("L33"),
  "environment.urbanAir.primary": route("L31"),
  "sec.cleanRivers": route("L28"),
  "sec.cleanRiversSanitation": route("L28"),
  "sec.urbanRenewal": route("L22"),
  "sec.correctionsRehabilitation": route("L35"),
};
const japanese: Record<string, RecoveryRoute[]> = {
  jp_regional_economic_development: route("L06"),
  jp_regional_transport: route("L26"),
  jp_regional_agriculture: route("L37"),
  jp_regional_education: [
    { familyId: "L38", weight: 0.6 },
    { familyId: "L10", weight: 0.4 },
  ],
  jp_regional_health: [
    { familyId: "L16", weight: 0.5 },
    { familyId: "L19", weight: 0.5 },
  ],
  jp_regional_utilities: [
    { familyId: "L28", weight: 0.75 },
    { familyId: "L32", weight: 0.25 },
  ],
  jp_regional_environment: [
    { familyId: "L31", weight: 0.5 },
    { familyId: "L33", weight: 0.5 },
  ],
  jp_regional_governance: [
    { familyId: "L44", weight: 0.5 },
    { familyId: "L41", weight: 0.5 },
  ],
};
export function legacyRecoveryRoutes(country: string, sourceId: string): readonly RecoveryRoute[] {
  if (country === "JP") return japanese[sourceId] ?? [];
  const prefixes: Readonly<Record<string, string>> = { US: "us.", UK: "uk." };
  const prefix = prefixes[country] ?? "";
  return prefix && sourceId.startsWith(prefix)
    ? (political[sourceId.slice(prefix.length)] ?? [])
    : [];
}
