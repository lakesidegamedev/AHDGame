/**
 * Provenance for turn-of-century legislative wants. Poll salience informs topics;
 * bounded options are authored game requests, not inferred vote shares, enacted
 * laws or a claim that each member of a demographic holds the same position.
 */
export const YEAR_2000_CALIBRATION = {
  period: { from: 1999, untilExclusive: 2007, referenceYear: 2000 },
  sources: {
    US: [
      "https://www.pewresearch.org/politics/2000/09/14/ii-the-issues/",
      "https://news.gallup.com/poll/2329/gore-bush-rally-traditional-constituent-groups.aspx",
      "https://ropercenter.cornell.edu/how-groups-voted-2000",
      "https://www.dol.gov/agencies/whd/minimum-wage/history/chart",
      "https://www.revenue.nh.gov/taxes-glance/interest-and-dividends-tax",
      "https://www.tn.gov/revenue/taxes/hall-income-tax.html",
    ],
    UK: [
      "https://www.ipsos.com/en-uk/political-attitudes-great-britain-september-2000",
      "https://researchbriefings.files.parliament.uk/documents/SN00917/SN00917.pdf",
      "https://www.parliament.scot/bills-and-laws/bills/s1/education-graduate-endowment-and-student-support-scotland-number-2-bill",
    ],
    JP: [
      "https://www.mhlw.go.jp/www1/english/wp_5/vol1/p2c2s1.html",
      "https://www5.cao.go.jp/keizai1/keizaitaisaku/1999/19991111b-taisaku.html",
      "https://www.jil.go.jp/english/JLR/documents/2009/JLR22_all.pdf",
      "https://jahis.law.nagoya-u.ac.jp/lawdb/l/325a0100/compare/325a0100en",
    ],
  },
  limitations: [
    "National surveys do not prove exact race-by-state or region-by-degree law preferences; those distinctions are cautious design content.",
    "Education buckets retain the underlying model's leans. No modern partisan ordering or historical vote percentage is substituted for issue attitudes.",
    "The legacy wealth dimension is income, not net assets or homeownership. No asset-based priorities are inferred from it.",
    "No broad wage-income-tax states request 0%. NH/TN still taxed investment income in 2000; the zero option is an abolition request, not an assertion of their enacted rate.",
    "US and JP wage ladders lack moderate year-2000 amounts. Employment, worker protection and training laws replace nominal wage targets in these presets.",
    "The UK catalogue has no EU/euro or race-equality ladder. No unrelated foreign-policy or online-voting law is presented as one; community justice supplies victim-support interests.",
    "Scotland's free-tuition option is an aspiration to retain abolition and oppose the proposed graduate endowment, not a claim that universal grants were enacted.",
    "Medicare law choices represent public negotiation versus private competition requests. They do not claim that Part D or negotiation powers already existed in 2000.",
    "Japan's legacy ethnicity buckets encode citizen versus foreign-national residents. Naturalized citizens are not excluded on ancestry grounds.",
    "No law options or rates are changed, and saved Admin overrides always take precedence. Calibration is display-only; electorate coverage is separately qualified.",
    "Coverage correction is limited to the 1999-2006 period; other eras retain their existing election and referendum balance.",
  ],
} as const;
