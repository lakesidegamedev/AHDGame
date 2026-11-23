import { describe, expect, it } from "vitest";
import { repairWelcomeMailBody } from "./welcomeMailRepair";
import { buildWelcomeMailBody } from "./welcomeMail";

const old =
  "You have a character, a home province, C$472,060 in campaign funds, and 25 bonus actions. That is more than most politicians start with.\n\nThe rest.";

describe("repairWelcomeMailBody", () => {
  it("marks the figures as opening amounts", () => {
    const out = repairWelcomeMailBody(old);
    expect(out).toContain("You started with a character, a home province, C$472,060");
    expect(out).toContain("opening figures from the day you created this character");
    expect(out.endsWith("The rest.")).toBe(true);
  });
  it("leaves current mail alone", () => {
    const current = repairWelcomeMailBody(old);
    expect(repairWelcomeMailBody(current)).toBe(current);
    expect(buildWelcomeMailBody).toBeTypeOf("function");
  });
});
