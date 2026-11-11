import type { CountryFolder } from "../contract";
import { QC_IDENTITY } from "./identity";
import { QC_INSTITUTIONS } from "./institutions";
import { QC_ELECTIONS } from "./elections";
import { QC_ECONOMY } from "./economy";
import { QC_GEOGRAPHY } from "./geography";
import { QC_ERAS } from "./eras";

/**
 * Quebec's country folder: the latent successor a passed sovereignty
 * referendum stands up. Server-side consumers only; client surfaces take
 * `./identity` or `./geographyFacts`.
 */
export const QC: CountryFolder<"QC"> = {
  id: "QC",
  identity: QC_IDENTITY,
  institutions: QC_INSTITUTIONS,
  elections: QC_ELECTIONS,
  economy: QC_ECONOMY,
  geography: QC_GEOGRAPHY,
  eras: QC_ERAS,
};

export { QC_IDENTITY } from "./identity";
export { QC_INSTITUTIONS } from "./institutions";
export { QC_ELECTIONS } from "./elections";
export { QC_ECONOMY } from "./economy";
export { QC_GEOGRAPHY } from "./geography";
export { QC_ERAS } from "./eras";
