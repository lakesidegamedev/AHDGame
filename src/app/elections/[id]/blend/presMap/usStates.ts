/**
 * Static US state reference for the presidential map: FIPS code (the id used by
 * the us-atlas TopoJSON) to postal code, postal code to name, and the states
 * too small to carry a label on the map.
 */

import { US_STATE_AND_DC_NAMES } from "@/lib/constants/usStateNames";

export const FIPS_TO_STATE: Record<string, string> = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
};

export const STATE_NAMES = US_STATE_AND_DC_NAMES;

/**
 * North-eastern states and DC, listed beside the map as clickable callouts the
 * way a broadcast map does. At national scale they are too small to hold a
 * label or to hit reliably with a finger.
 */
export const CALLOUT_STATES: readonly string[] = [
  "VT",
  "NH",
  "MA",
  "RI",
  "CT",
  "NJ",
  "DE",
  "MD",
  "DC",
];
