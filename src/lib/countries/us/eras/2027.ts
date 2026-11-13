import type { CountryEraOverride } from "../../contract";

/** Regional capacity follows this era's authored state legislatures. */
export const US_2027: CountryEraOverride = {
  preset: "2027-default",
  config: {
    subNationalChamber: {
      key: "stateSenate",
      name: "State Senate",
      shortName: "State Senate",
      seats: 1973,
      description: "Each state's elected legislature, which sets state law and budgets.",
      elected: true,
    },
  },
};
