import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// GDR — Volkskammer National Front fixed allocation (SED + mass orgs ~58%, each
// bloc party ~10.4%). Allocated across the eastern Länder (sum = 500, matching
// ddRegions houseDistricts): BEO 35, MV 64, BB 81, ST 91, SN 153, TH 76.
export const DD_VOLKSKAMMER_1979: HistoricalSeat[] = [
  { state: "BEO", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 20 },
  { state: "BEO", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 4 },
  { state: "BEO", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 4 },
  { state: "BEO", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 4 },
  { state: "BEO", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 3 },
  { state: "MV", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 37 },
  { state: "MV", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 7 },
  { state: "MV", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 7 },
  { state: "MV", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 7 },
  { state: "MV", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 6 },
  { state: "BB", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 47 },
  { state: "BB", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 8 },
  { state: "BB", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 8 },
  { state: "BB", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 8 },
  { state: "BB", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 10 },
  { state: "ST", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 53 },
  { state: "ST", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 9 },
  { state: "ST", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 9 },
  { state: "ST", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 9 },
  { state: "ST", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 11 },
  { state: "SN", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 89 },
  { state: "SN", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 16 },
  { state: "SN", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 16 },
  { state: "SN", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 16 },
  { state: "SN", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 16 },
  { state: "TH", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 44 },
  { state: "TH", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 8 },
  { state: "TH", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 8 },
  { state: "TH", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 8 },
  { state: "TH", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 8 },
];
