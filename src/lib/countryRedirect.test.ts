import { describe, expect, it } from "vitest";
import { countryScopedUrl } from "./countryRedirect";

describe("countryScopedUrl", () => {
  it("defaults to the United States when no country is given", () => {
    expect(countryScopedUrl("politicians")).toBe("/country/us/politicians");
    expect(countryScopedUrl("politicians", {})).toBe("/country/us/politicians");
    expect(countryScopedUrl("politicians", { country: "" })).toBe("/country/us/politicians");
  });

  it("lower-cases the requested country and keeps the destination path", () => {
    expect(countryScopedUrl("politicians", { country: "UK" })).toBe("/country/uk/politicians");
    expect(countryScopedUrl("parties/coalition/abc", { country: "IE" })).toBe(
      "/country/ie/parties/coalition/abc"
    );
  });

  it("uses the first value when the query parameter is repeated", () => {
    expect(countryScopedUrl("budget", { country: ["JP", "US"] })).toBe("/country/jp/budget");
  });
});
