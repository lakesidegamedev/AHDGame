import type { CountryBucketLabels } from "@/lib/demographics/bucketLabelScaffolding";
import { AGE_EN, DIMS_EN, INCOME_EN, URBAN_EN } from "@/lib/demographics/bucketLabelScaffolding";

export const CA_BUCKET_LABELS: CountryBucketLabels = {
  dims: DIMS_EN,
  buckets: {
    ethnicity: {
      anglophone: "Anglophone",
      francophone: "Francophone",
      indigenous: "Indigenous peoples",
      south_asian: "South Asian Canadians",
      east_se_asian: "East and Southeast Asian Canadians",
      other_background: "Other backgrounds",
    },
    age: AGE_EN,
    education: {
      no_certificate: "No certificate",
      high_school: "High school",
      college_trades: "College or trades",
      university: "University degree",
    },
    income: INCOME_EN,
    urbanization: URBAN_EN,
  },
};
