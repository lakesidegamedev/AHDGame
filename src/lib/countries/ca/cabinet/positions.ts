/**
 * Canada's cabinet seats. The Prime Minister heads the government and is seated
 * by the formation flow, so the list starts at the Deputy Prime Minister. Seat
 * ids match `CA_CABINET_GROUPS` and `CA_CABINET_SEAT_IDS`.
 */
export const CA_CABINET_POSITIONS = [
  { id: "deputy_prime_minister", name: "Deputy Prime Minister", order: 0, yearEnabled: 1775 },
  { id: "minister_of_finance", name: "Minister of Finance", order: 1, yearEnabled: 1775 },
  {
    id: "minister_of_foreign_affairs",
    name: "Minister of Foreign Affairs",
    order: 2,
    yearEnabled: 1775,
  },
  {
    id: "minister_of_national_defence",
    name: "Minister of National Defence",
    order: 3,
    yearEnabled: 1775,
  },
  { id: "minister_of_justice", name: "Minister of Justice", order: 4, yearEnabled: 1775 },
  {
    id: "minister_of_public_safety",
    name: "Minister of Public Safety",
    order: 5,
    yearEnabled: 1775,
  },
  { id: "minister_of_industry", name: "Minister of Industry", order: 6, yearEnabled: 1775 },
  {
    id: "minister_of_international_trade",
    name: "Minister of International Trade",
    order: 7,
    yearEnabled: 1775,
  },
  { id: "minister_of_labour", name: "Minister of Labour", order: 8, yearEnabled: 1775 },
  {
    id: "minister_of_natural_resources",
    name: "Minister of Natural Resources",
    order: 9,
    yearEnabled: 1775,
  },
  { id: "minister_of_health", name: "Minister of Health", order: 10, yearEnabled: 1775 },
  {
    id: "minister_of_education_and_skills",
    name: "Minister of Education and Skills",
    order: 11,
    yearEnabled: 1775,
  },
  { id: "minister_of_housing", name: "Minister of Housing", order: 12, yearEnabled: 1775 },
  {
    id: "minister_of_infrastructure",
    name: "Minister of Infrastructure",
    order: 13,
    yearEnabled: 1775,
  },
  { id: "minister_of_agriculture", name: "Minister of Agriculture", order: 14, yearEnabled: 1775 },
  { id: "minister_of_environment", name: "Minister of Environment", order: 15, yearEnabled: 1775 },
  {
    id: "minister_of_intergovernmental_affairs",
    name: "Minister of Intergovernmental Affairs",
    order: 16,
    yearEnabled: 1775,
  },
  {
    id: "government_house_leader",
    name: "Government House Leader",
    order: 17,
    yearEnabled: 1775,
  },
  {
    id: "director_of_intelligence",
    name: "Director of Intelligence",
    order: 18,
    yearEnabled: 1775,
  },
] as const;
