import { describe, expect, it } from "vitest";
import {
  BLOC_PAIR_BASELINE,
  blocDyadFloors,
  blocOfAlignment,
  blocPairOf,
  stepBlocDyads,
} from "./blocTension";

const blocs: Record<string, "us" | "cn" | "nonAligned"> = {
  US: "us",
  PL: "us",
  CN: "cn",
  RU: "cn",
  BR: "nonAligned",
  NG: "nonAligned",
};
const blocOf = (id: string) => blocs[id] ?? "nonAligned";

describe("blocOfAlignment", () => {
  it("places a country by its leading share, with the great powers fixed", () => {
    expect(blocOfAlignment("US", undefined)).toBe("us");
    expect(blocOfAlignment("CN", { shares: { WASHINGTON: 90 }, nonAligned: 10 })).toBe("cn");
    expect(blocOfAlignment("PL", { shares: { WASHINGTON: 70, MOSCOW: 5 }, nonAligned: 25 })).toBe(
      "us"
    );
    // Beijing and Moscow count together.
    expect(
      blocOfAlignment("RU", { shares: { WASHINGTON: 20, BEIJING: 20, MOSCOW: 30 }, nonAligned: 30 })
    ).toBe("cn");
    expect(blocOfAlignment("BR", { shares: { WASHINGTON: 25, BEIJING: 20 }, nonAligned: 55 })).toBe(
      "nonAligned"
    );
    expect(blocOfAlignment("XX", undefined)).toBe("nonAligned");
  });

  it("names each unordered pair once", () => {
    expect(blocPairOf("cn", "us")).toBe("us-cn");
    expect(blocPairOf("nonAligned", "us")).toBe("us-nonAligned");
    expect(blocPairOf("cn", "nonAligned")).toBe("cn-nonAligned");
    expect(blocPairOf("us", "us")).toBeNull();
  });
});

describe("blocDyadFloors", () => {
  it("sits at the structural baseline in a quiet world", () => {
    expect(
      blocDyadFloors({ blocOf, wars: [], embargoes: [], nuclearCountries: new Set() })
    ).toEqual(BLOC_PAIR_BASELINE);
  });

  it("raises only the pair a war is fought across", () => {
    const floors = blocDyadFloors({
      blocOf,
      wars: [{ sideACountries: ["RU"], sideBCountries: ["PL"], intensity: 60 }],
      embargoes: [],
      nuclearCountries: new Set(),
    });
    expect(floors["us-cn"]).toBe(BLOC_PAIR_BASELINE["us-cn"] + 15);
    expect(floors["us-nonAligned"]).toBe(BLOC_PAIR_BASELINE["us-nonAligned"]);
    expect(floors["cn-nonAligned"]).toBe(BLOC_PAIR_BASELINE["cn-nonAligned"]);
  });

  it("ignores a war inside one bloc and adds a nuclear premium across blocs", () => {
    const inside = blocDyadFloors({
      blocOf,
      wars: [{ sideACountries: ["US"], sideBCountries: ["PL"], intensity: 90 }],
      embargoes: [],
      nuclearCountries: new Set(["US"]),
    });
    expect(inside).toEqual(BLOC_PAIR_BASELINE);
    const nuclear = blocDyadFloors({
      blocOf,
      wars: [{ sideACountries: ["RU"], sideBCountries: ["US"], intensity: 40 }],
      embargoes: [],
      nuclearCountries: new Set(["RU", "US"]),
    });
    expect(nuclear["us-cn"]).toBe(BLOC_PAIR_BASELINE["us-cn"] + 10 + 15);
  });

  it("counts embargoes across blocs, capped", () => {
    const floors = blocDyadFloors({
      blocOf,
      wars: [],
      embargoes: [
        { sourceCountry: "BR", targetCountry: "US" },
        { sourceCountry: "PL", targetCountry: "US" },
        ...Array.from({ length: 30 }, () => ({ sourceCountry: "US", targetCountry: "CN" })),
      ],
      nuclearCountries: new Set(),
    });
    expect(floors["us-nonAligned"]).toBe(BLOC_PAIR_BASELINE["us-nonAligned"] + 1.5);
    expect(floors["us-cn"]).toBe(BLOC_PAIR_BASELINE["us-cn"] + 15);
  });
});

describe("stepBlocDyads", () => {
  it("starts at the floor, rises to it at once and relaxes toward it slowly", () => {
    const floors = { "us-cn": 40, "us-nonAligned": 10, "cn-nonAligned": 8 };
    const first = stepBlocDyads(undefined, floors);
    expect(first.find((d) => d.pair === "us-cn")).toEqual({ pair: "us-cn", value: 40, floor: 40 });
    const hot = stepBlocDyads([{ pair: "us-cn", value: 80, floor: 80 }], {
      ...floors,
      "us-cn": 30,
    }).find((d) => d.pair === "us-cn")!;
    expect(hot.value).toBeLessThan(80);
    expect(hot.value).toBeGreaterThan(70);
    const risen = stepBlocDyads([{ pair: "us-cn", value: 20, floor: 20 }], floors).find(
      (d) => d.pair === "us-cn"
    )!;
    expect(risen.value).toBe(40);
  });
});
