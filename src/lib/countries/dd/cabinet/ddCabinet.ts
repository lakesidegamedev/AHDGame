/**
 * East Germany (DD) Cabinet positions , Council of Ministers of the GDR.
 * The General Secretary appoints ministers directly from Volkskammer
 * deputies, mirroring the USSR Council of Ministers pattern.
 *
 * Slot IDs mirror RU_CABINET_POSITIONS one-for-one so DD reuses the RU
 * cabinet mechanics verbatim; the `name`s are the GDR-authentic labels
 * players see. `generalSecretary` matches DD's executive office key, and
 * `minister_of_finance` matches COUNTRY_CONFIGS.DD.financeMinisterCabinetId.
 *
 * Year gating: canonical names are 1970s-authentic; every gate below is a
 * 1950s correction. DD's post-1990 absence is country-level registration,
 * not seat gating.
 */
export const DD_CABINET_POSITIONS = [
  {
    id: "generalSecretary",
    name: "General Secretary",
    order: 0,
    isHeadOfGovernment: true,
    yearEnabled: 1775,
    namesByYear: [
      { from: 1775, name: "General Secretary" },
      { from: 1953, name: "First Secretary" },
      { from: 1976, name: "General Secretary" },
    ],
  },
  {
    id: "first_deputy_premier",
    name: "First Deputy Chairman of the Council of Ministers",
    order: 1,
    yearEnabled: 1775,
  },
  {
    id: "minister_of_foreign_affairs",
    name: "Minister of Foreign Affairs",
    order: 2,
    yearEnabled: 1775,
  },
  { id: "minister_of_defence", name: "Minister of National Defence", order: 3, yearEnabled: 1956 },
  { id: "minister_of_finance", name: "Minister of Finance", order: 4, yearEnabled: 1775 },
  {
    id: "minister_of_internal_affairs",
    name: "Minister of Internal Affairs",
    order: 5,
    yearEnabled: 1775,
  },
  {
    id: "chairman_of_gosplan",
    name: "Chairman of the State Planning Commission",
    order: 6,
    yearEnabled: 1775,
  },
  {
    id: "gosbank_liaison",
    name: "Council Liaison to the Staatsbank",
    order: 7,
    yearEnabled: 1775,
    namesByYear: [
      { from: 1775, name: "Council Liaison to the Deutsche Notenbank" },
      { from: 1968, name: "Council Liaison to the Staatsbank" },
    ],
  },
  {
    id: "minister_of_foreign_trade",
    name: "Minister of Foreign Trade",
    order: 8,
    yearEnabled: 1775,
  },
  {
    id: "minister_of_internal_trade",
    name: "Minister of Trade and Supply",
    order: 9,
    yearEnabled: 1775,
  },
  {
    id: "minister_of_agriculture",
    name: "Minister of Agriculture, Forestry and Food",
    order: 10,
    yearEnabled: 1775,
    namesByYear: [
      { from: 1775, name: "Minister of Agriculture and Forestry" },
      { from: 1970, name: "Minister of Agriculture, Forestry and Food" },
    ],
  },
  {
    id: "minister_of_machine_building",
    name: "Minister of Heavy Industry and Machine Building",
    order: 11,
    yearEnabled: 1775,
  },
  { id: "minister_of_railways", name: "Minister of Transport", order: 12, yearEnabled: 1775 },
  { id: "minister_of_culture", name: "Minister of Culture", order: 13, yearEnabled: 1954 },
  { id: "minister_of_health", name: "Minister of Health", order: 14, yearEnabled: 1775 },
  {
    id: "minister_of_higher_education",
    name: "Minister of Higher and Technical Education",
    order: 15,
    yearEnabled: 1775,
    namesByYear: [
      { from: 1775, name: "State Secretary for Higher Education" },
      { from: 1967, name: "Minister of Higher and Technical Education" },
    ],
  },
  {
    id: "director_of_intelligence",
    name: "Minister for State Security",
    order: 16,
    yearEnabled: 1950,
  },
] as const;
