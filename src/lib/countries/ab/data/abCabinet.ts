/**
 * Alberta's cabinet seats as a successor country, kept free of value imports so
 * client registries can reach them; the cabinet registries build positions,
 * mechanics and orders from it. The Premier appoints
 * ministers directly. Seat ids reuse the devolved-cabinet ids so mechanics and orders
 * come from the shared Westminster tables (see devolvedCabinet.ts).
 *
 * `financeSecretary` matches the AB config's `financeMinisterCabinetId`.
 */
import type { DevolvedSeat } from "@/lib/cabinet/rules/devolvedSeats";

export const AB_CABINET_SEATS: DevolvedSeat[] = [
  { id: "deputyFirstMinister", name: "Deputy Premier", department: "Executive Council" },
  {
    id: "financeSecretary",
    name: "Minister of Finance",
    department: "Treasury Board and Finance",
  },
  {
    id: "externalAffairsSecretary",
    name: "Minister of Intergovernmental and International Relations",
    department: "Intergovernmental and International Relations",
  },
  {
    id: "justiceSecretary",
    name: "Minister of Justice and Public Safety",
    department: "Justice and Public Safety",
  },
  { id: "defenceSecretary", name: "Minister of Defence", department: "Defence" },
  { id: "healthSecretary", name: "Minister of Health", department: "Health" },
  { id: "educationSecretary", name: "Minister of Education", department: "Education" },
  {
    id: "economySecretary",
    name: "Minister of Jobs, Economy and Trade",
    department: "Jobs, Economy and Trade",
  },
  {
    id: "communitiesSecretary",
    name: "Minister of Municipal Affairs",
    department: "Municipal Affairs",
  },
  {
    id: "transportSecretary",
    name: "Minister of Transportation and Economic Corridors",
    department: "Transportation and Economic Corridors",
  },
  {
    id: "netZeroSecretary",
    name: "Minister of Energy and Environment",
    department: "Energy and Environment",
  },
  {
    id: "socialJusticeSecretary",
    name: "Minister of Seniors, Community and Social Services",
    department: "Seniors, Community and Social Services",
  },
];
