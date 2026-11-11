/**
 * Quebec's cabinet seats as a successor country, kept free of value imports so
 * client registries can reach them; the cabinet registries build positions,
 * mechanics and orders from it. The Premier appoints
 * ministers directly. Seat ids reuse the devolved-cabinet ids so mechanics and orders
 * come from the shared Westminster tables (see devolvedCabinet.ts).
 *
 * `financeSecretary` matches the QC config's `financeMinisterCabinetId`.
 */
import type { DevolvedSeat } from "@/lib/cabinet/rules/devolvedSeats";

export const QC_CABINET_SEATS: DevolvedSeat[] = [
  { id: "deputyFirstMinister", name: "Deputy Premier", department: "Conseil exécutif" },
  {
    id: "financeSecretary",
    name: "Minister of Finance",
    department: "Ministère des Finances",
  },
  {
    id: "externalAffairsSecretary",
    name: "Minister of International Relations",
    department: "Ministère des Relations internationales",
  },
  {
    id: "justiceSecretary",
    name: "Minister of Justice and Public Security",
    department: "Ministère de la Justice",
  },
  { id: "defenceSecretary", name: "Minister of Defence", department: "Ministère de la Défense" },
  {
    id: "healthSecretary",
    name: "Minister of Health and Social Services",
    department: "Ministère de la Santé et des Services sociaux",
  },
  {
    id: "educationSecretary",
    name: "Minister of Education",
    department: "Ministère de l'Éducation",
  },
  {
    id: "economySecretary",
    name: "Minister of the Economy",
    department: "Ministère de l'Économie",
  },
  {
    id: "communitiesSecretary",
    name: "Minister of Municipal Affairs",
    department: "Ministère des Affaires municipales",
  },
  {
    id: "transportSecretary",
    name: "Minister of Transport",
    department: "Ministère des Transports",
  },
  {
    id: "netZeroSecretary",
    name: "Minister of the Environment and Energy",
    department: "Ministère de l'Environnement",
  },
  {
    id: "socialJusticeSecretary",
    name: "Minister of Employment and Social Solidarity",
    department: "Ministère de l'Emploi et de la Solidarité sociale",
  },
];
