import { describe, expect, it } from "vitest";
import { buildRuntimeExchangeMeta } from "./stockMarketRouting";

describe("stockMarketRouting", () => {
  it("includes the global market and the enabled country exchange", () => {
    const meta = buildRuntimeExchangeMeta(new Set(["US"]));

    expect(meta.global.exchangeApi).toBe("global");
    expect(meta.US.exchangeApi).toBe("nyse");
    expect(meta.US.title).toBe("NYSE");
  });

  it("shows the NGX tab when Nigeria is economy-visible at runtime", () => {
    // Live activates NG via countryGameStates even though the static config
    // still says coming-soon; the runtime visibility set is what gates the tab.
    const meta = buildRuntimeExchangeMeta(new Set(["US", "UK", "NG"]));

    expect(meta.NG).toEqual({
      title: "NGX",
      subtitle: "NGX - Nigeria",
      exchangeApi: "ngx",
    });
    expect(meta.US.exchangeApi).toBe("nyse");
    expect(meta.CN).toBeUndefined();
  });

  it("uses the runtime name for the exchange subtitle", () => {
    const meta = buildRuntimeExchangeMeta(new Set(["DD"]), () => "Germany");
    expect(meta.DD.subtitle).toBe("VVB - Germany");
  });

  it("omits a country that is not in the visible set from the pill row", () => {
    // The visibility set is built by the page from /api/countries and now
    // contains only enabledForPlayers countries; this asserts the meta builder
    // respects whatever set it is handed.
    const meta = buildRuntimeExchangeMeta(new Set(["US", "UK"]));

    expect(meta.BR).toBeUndefined();
    expect(meta.IE).toBeUndefined();
    expect(meta.US).toBeDefined();
    expect(meta.UK).toBeDefined();
  });

  it("still gives the current country its own pill when it is not enabled", () => {
    // "Gate the pill, keep the page": landing directly on a non-enabled
    // country's market page must show that country's listings, not fall
    // through to Global. The page adds the current country to the set.
    const meta = buildRuntimeExchangeMeta(new Set(["US", "BR"]));

    expect(meta.BR).toBeDefined();
    expect(meta.BR.exchangeApi).toBe("b3");
  });

  it("does not offer a command economy's register as a pill unless it is visible", () => {
    const meta = buildRuntimeExchangeMeta(new Set(["US"]));

    expect(meta.RU).toBeUndefined();
    expect(meta.DD).toBeUndefined();
  });

  it("uses the registry's hyphenated api key for a multi-word register", () => {
    // Deriving the key locally as exchangeName.toLowerCase() would yield
    // "gosplan ssr" — a space-bearing key that matches no snapshot _id.
    const meta = buildRuntimeExchangeMeta(new Set(["BAL"]));

    expect(meta.BAL.title).toBe("GOSPLAN SSR");
    expect(meta.BAL.exchangeApi).toBe("gosplan-ssr");
    expect(meta.BAL.exchangeApi).not.toMatch(/\s/);
  });
});
