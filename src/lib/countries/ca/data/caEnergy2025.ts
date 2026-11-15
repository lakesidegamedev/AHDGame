/** Canadian observations, held forward as the 2027 opening baseline, not a 2027 forecast. */
export const CA_ENERGY_2025 = {
  referenceYear: 2025,
  sources: {
    gas: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510005501",
    petroleum: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510008101",
    mix: "https://www150.statcan.gc.ca/n1/daily-quotidien/261110/dq261110b-eng.pdf",
    stockholding: "https://www.iea.org/articles/canada-oil-security-policy-2",
  },
  // Published primary-production shares total 99.9% because of rounding.
  primaryProductionShares: {
    crudeOil: 48,
    naturalGas: 36.1,
    primaryElectricity: 6.9,
    naturalGasLiquids: 4.3,
    coal: 4.3,
    renewableFuels: 0.3,
  },
  fuels: [
    {
      id: "natural_gas",
      unit: "GJ",
      finalEnergySharePercent: 38.1,
      annualImports: 1_120_583_700,
      annualDomesticUse: 5_302_061_100,
      decemberClosingCommercialStock: 1_055_256_400,
      // Table reports thousands of GJ: these vector values are multiplied by 1,000.
      vectors: {
        imports: [107638459],
        domesticUse: [107638461, 107638463, 107638465],
        stock: [107638471],
      },
    },
    {
      id: "finished_petroleum",
      unit: "m3",
      finalEnergySharePercent: 35.3,
      annualImports: 9_099_908,
      annualDomesticUse: 104_294_932,
      decemberClosingCommercialStock: 4_327_114,
      // Product 17: finished petroleum. Condensate and crude are not added to this series.
      vectors: { imports: [1251227447], domesticUse: [1251227512], stock: [1251227531] },
    },
  ],
} as const;
