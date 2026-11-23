import { describe, expect, it } from "vitest";
import { orderIssuerLabel } from "./issuerLabel";

describe("orderIssuerLabel", () => {
  it("leaves an office-holder's own orders under their name", () => {
    expect(orderIssuerLabel("Joseph McCarthy", "holder", "Joseph McCarthy", "Governor")).toBe(
      "Joseph McCarthy"
    );
  });
  it("credits a party chair as acting for the governor", () => {
    expect(
      orderIssuerLabel("Raymond Reddington", "stateChair", "Sarah Rosenberg", "Governor")
    ).toBe("Raymond Reddington (State Party Chair, acting for Governor Sarah Rosenberg)");
  });
  it("still names the office when the holder name is unknown", () => {
    expect(orderIssuerLabel("A B", "nationalViceChair", null, "Governor")).toBe(
      "A B (National Party Vice-Chair, acting for the Governor)"
    );
  });
});
