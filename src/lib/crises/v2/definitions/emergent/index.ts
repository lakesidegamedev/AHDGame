import type { CrisisDefinition } from "../../types";
import { bankingPanicDefinition } from "./bankingPanic";
import { debtCrisisDefinition } from "./debtCrisis";
import { energyShortageDefinition } from "./energyShortage";
import { recessionDefinition } from "./recession";
import { regionalUnemploymentDefinition } from "./regionalUnemployment";
import { unrestWaveDefinition } from "./unrestWave";

export const EMERGENT_CRISIS_DEFINITIONS: readonly CrisisDefinition[] = [
  recessionDefinition,
  bankingPanicDefinition,
  debtCrisisDefinition,
  regionalUnemploymentDefinition,
  energyShortageDefinition,
  unrestWaveDefinition,
];
