/**
 * California's cabinet seats as a successor country, kept free of value imports so
 * client registries can reach them; the cabinet registries build positions,
 * mechanics and orders from it. The Premier appoints ministers
 * directly. Seat ids reuse the devolved-cabinet ids so mechanics and orders
 * come from the shared Westminster tables (see devolvedCabinet.ts).
 *
 * `financeSecretary` matches the RCA config's `financeMinisterCabinetId`.
 */
import type { DevolvedSeat } from "@/lib/cabinet/rules/devolvedSeats";

export const RCA_CABINET_SEATS: DevolvedSeat[] = [
  {
    id: "deputyFirstMinister",
    name: "Deputy Premier",
    department: "Office of the Premier",
  },
  { id: "financeSecretary", name: "Treasurer", department: "Treasury" },
  {
    id: "externalAffairsSecretary",
    name: "Secretary of State for Foreign Affairs",
    department: "Foreign Affairs",
  },
  {
    id: "justiceSecretary",
    name: "Attorney General",
    department: "Justice and Public Safety",
  },
  { id: "defenceSecretary", name: "Secretary of Defence", department: "Defence" },
  { id: "healthSecretary", name: "Secretary of Health", department: "Health" },
  { id: "educationSecretary", name: "Secretary of Education", department: "Education" },
  {
    id: "economySecretary",
    name: "Secretary of Commerce",
    department: "Commerce and Trade",
  },
  {
    id: "communitiesSecretary",
    name: "Secretary of Local Government",
    department: "Local Government",
  },
  {
    id: "transportSecretary",
    name: "Secretary of Transportation",
    department: "Transportation",
  },
  {
    id: "netZeroSecretary",
    name: "Secretary of Energy and Water",
    department: "Energy and Water",
  },
  {
    id: "socialJusticeSecretary",
    name: "Secretary of Human Services",
    department: "Human Services",
  },
];
