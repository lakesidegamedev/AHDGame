/**
 * Census profiles for the six New England regions. They are the live state
 * profiles (ACS-based race, education, wealth and age shares, with the game's
 * ideology calibration), so an independent New England opens with the same
 * electorate its states had.
 */
import type { Layer1Config } from "@/lib/seeds/stateDemographics";
import { stateCensusData2027 } from "../../us/data/usStateCensusData2027";

const MEMBERS = ["ME", "NH", "VT", "MA", "RI", "CT"] as const;

export const nenRegionCensusData2027: Record<string, Layer1Config> = Object.fromEntries(
  MEMBERS.map((id) => [id, stateCensusData2027[id]])
);
