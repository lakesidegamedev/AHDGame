import { describe, expect, it } from "vitest";
import { buildSuccessionNews, officeNoun } from "./successionNews";

describe("buildSuccessionNews", () => {
  it("announces a vacancy with who is acting", () => {
    const news = buildSuccessionNews({
      event: "vacancy",
      countryName: "France",
      office: "president",
      actingLabel: "Prime Minister",
    });
    expect(news.content).toBe(
      "The presidency of France is vacant. Prime Minister is acting until it is filled."
    );
  });

  it("announces a special election and its filing window", () => {
    const news = buildSuccessionNews({
      event: "election_opened",
      countryName: "France",
      office: "president",
      filingTurns: 24,
    });
    expect(news.content).toContain("special presidential election");
    expect(news.content).toContain("24 turns");
  });

  it("names the person seated, and copes without a name", () => {
    expect(
      buildSuccessionNews({
        event: "seated",
        countryName: "China",
        office: "premier",
        holderName: "Li Wei",
      }).content
    ).toBe("Li Wei takes the premiership of China.");
    expect(
      buildSuccessionNews({ event: "seated", countryName: "China", office: "premier" }).content
    ).toContain("A new holder");
  });

  it("uses plain wording and no dashes", () => {
    for (const event of ["vacancy", "overdue", "election_opened", "seated"] as const) {
      const { title, content } = buildSuccessionNews({
        event,
        countryName: "Spain",
        office: "primeMinister",
        actingLabel: "Council of Ministers",
      });
      expect(`${title} ${content}`).not.toMatch(/[–—]/);
    }
    expect(officeNoun("unknownOffice")).toBe("office of unknownOffice");
  });
});
