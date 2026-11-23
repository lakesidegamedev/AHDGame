import { describe, expect, it } from "vitest";
import { repairBriefBody, repairBriefStory } from "./briefTextRepair";

describe("repairBriefBody", () => {
  it("rewrites the old bond sentence as a fixed coupon with the price when written", () => {
    const out = repairBriefBody(
      "In Hungary, its credit rating moved from A to AA. Its nearest bond pays 8.75% and trades at 100.9. Thin demand can push yields up.",
      "HUF"
    );
    expect(out).toContain("Its nearest bond has a fixed coupon of 8.75%, set when it was issued");
    expect(out).toContain("traded at 100.9 when this brief was written");
    expect(out).not.toContain("trades at");
    expect(out).toContain("Thin demand can push yields up.");
  });

  it("turns percent-of-GDP tax figures that are really amounts into local currency", () => {
    const out = repairBriefBody(
      "Poland will consolidate its budget by 0.6% of GDP in fiscal year 2028: tax rises of 1304518589954.9% of GDP and spending cuts of 1118276517099.7% of GDP. Expect a weaker economy and a hit to the government's approval, and a stronger budget for bondholders. Its nearest bond pays 5.75% and trades at 100.2.",
      "PLN"
    );
    expect(out).toContain("tax increases");
    expect(out).toContain("13.0B PLN in tax increases and 11.2B PLN in spending cuts");
    expect(out).not.toMatch(/\d{9,}/);
    expect(out).toContain("fixed coupon of 5.75%");
  });

  it("leaves current wording and genuine small percentages alone", () => {
    const current =
      "X plans a budget adjustment equal to 1.0% of GDP in fiscal year 2029. The package includes 5.0B PLN in tax increases and 1.0B PLN in spending cuts.";
    expect(repairBriefBody(current, "PLN")).toBe(current);
    const small =
      "Finland will consolidate its budget by 1.7% of GDP in fiscal year 2028: tax rises of 0.7% of GDP and spending cuts of 1.0% of GDP. Expect a weaker economy and a hit to the government's approval, and a stronger budget for bondholders.";
    expect(repairBriefBody(small, "EUR")).toBe(small);
  });
});

describe("repairBriefStory", () => {
  it("retitles an upgrade filed under a strain headline", () => {
    const out = repairBriefStory(
      {
        headline: "Romania debt under strain",
        body: "In Romania, its credit rating moved from AA to AAA. Its nearest bond pays 10.25% and trades at 100.4. Thin demand can push yields up and bond prices down.",
      },
      "RON"
    );
    expect(out.headline).toBe("Romania upgraded to AAA");
    expect(out.body).toContain("credit rating rose from AA to AAA");
    expect(out.body).toContain("fixed coupon of 10.25%");
    expect(out.body).not.toContain("Thin demand");
  });

  it("keeps a real downgrade as strain", () => {
    const story = {
      headline: "Hungary debt under strain",
      body: "In Hungary, its credit rating moved from AA to A. Thin demand can push yields up and bond prices down.",
    };
    expect(repairBriefStory(story, "HUF")).toEqual(story);
  });

  it("drops the false downgrade clause when other strain facts remain", () => {
    const out = repairBriefStory(
      {
        headline: "Spain debt under strain",
        body: "In Spain, its credit rating moved from BB to BBB; debt stands at 112% of GDP. Thin demand can push yields up and bond prices down.",
      },
      "EUR"
    );
    expect(out.headline).toBe("Spain debt under strain");
    expect(out.body).toBe(
      "In Spain, debt stands at 112% of GDP. Thin demand can push yields up and bond prices down."
    );
  });

  it("rebuilds a templated outlook as prose from its own figures, differing by country", () => {
    const body = (n: string, g: string, i: string, d: string) =>
      `${n}: growth ${g}%, inflation ${i}%, debt ${d}% of GDP, rated B. Prices are the pressing problem, with inflation at ${i}%. Its nearest bond pays 5.75% and trades at 100.2.`;
    const it = repairBriefStory(
      { headline: "Italy outlook", body: body("Italy", "0.3", "24.2", "169") },
      "EUR"
    );
    const fr = repairBriefStory(
      { headline: "France outlook", body: body("France", "4.4", "2.1", "40") },
      "EUR"
    );
    expect(it.body).toContain("Italy is barely growing, at 0.3%.");
    expect(it.body).toContain("rate it B");
    expect(it.body).toContain("fixed coupon of 5.75%");
    expect(it.body).not.toContain("pressing problem");
    expect(fr.body).toContain("France is growing fast");
    expect(fr.body).toContain("Debt is light");
  });
});
