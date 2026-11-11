import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// GDR — 1st Volkskammer (elected Oct 1950); National Front: SED + bloc parties.
// Seats per Land ∝ ddRegions1953 houseDistricts (BEO 32 / MV 58 / BB 71 /
// ST 112 / SN 151 / TH 76 = 500); party totals SED 292, CDU/LDPD/NDPD 51 each,
// DBD 55.
export const DD_VOLKSKAMMER_1953: HistoricalSeat[] = [
  { state: "BEO", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 19 },
  { state: "BEO", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 3 },
  { state: "BEO", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 3 },
  { state: "BEO", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 3 },
  { state: "BEO", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 4 },
  { state: "MV", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 34 },
  { state: "MV", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 6 },
  { state: "MV", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 6 },
  { state: "MV", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 6 },
  { state: "MV", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 6 },
  { state: "BB", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 41 },
  { state: "BB", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 7 },
  { state: "BB", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 7 },
  { state: "BB", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 7 },
  { state: "BB", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 9 },
  { state: "ST", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 65 },
  { state: "ST", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 12 },
  { state: "ST", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 12 },
  { state: "ST", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 11 },
  { state: "ST", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 12 },
  { state: "SN", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 88 },
  { state: "SN", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 15 },
  { state: "SN", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 15 },
  { state: "SN", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 16 },
  { state: "SN", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 17 },
  { state: "TH", officeType: "volkskammerDeputy", party: "dd_sed", seatsHeld: 45 },
  { state: "TH", officeType: "volkskammerDeputy", party: "dd_cdu", seatsHeld: 8 },
  { state: "TH", officeType: "volkskammerDeputy", party: "dd_ldpd", seatsHeld: 8 },
  { state: "TH", officeType: "volkskammerDeputy", party: "dd_ndpd", seatsHeld: 8 },
  { state: "TH", officeType: "volkskammerDeputy", party: "dd_dbd", seatsHeld: 7 },
];
