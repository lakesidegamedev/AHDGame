import { describe, expect, it } from "vitest";
import { TECH_TREE } from "@/lib/constants/techTree/nodes";
import {
  effectiveMediaOperatingModelId,
  getMediaOperatingModel,
  MEDIA_OPERATING_MODELS,
  mediaOperatingModelOutputRates,
} from "./catalog";
import { getMediaOperatingModelStrategies } from "@/lib/constants/sectorStrategies";

describe("media operating model catalog", () => {
  it("lists only the current media and entertainment sector lanes", () => {
    expect(MEDIA_OPERATING_MODELS).toHaveLength(12);
    expect(
      [...new Set(MEDIA_OPERATING_MODELS.flatMap((model) => model.sectorTypes))].sort()
    ).toEqual(["media", "media_entertainment"]);
  });

  it("keeps streaming outside the 1953 opening world and on the current tech lanes", () => {
    const streaming = getMediaOperatingModel("streaming_platform");
    expect(streaming?.availableFromYear).toBeGreaterThan(1953);
    expect(streaming?.technologies).toEqual({
      media: { decade: "2009", nodeName: "Streaming Platforms" },
      media_entertainment: { decade: "2009", nodeName: "Streaming Distribution" },
    });
  });

  it("resolves unset and standard media strategies to newspaper for advertising", () => {
    for (const strategyId of [undefined, null, "", "   ", "standard"]) {
      expect(effectiveMediaOperatingModelId(strategyId, "media", 1953)).toBe("newspaper");
    }
  });

  it("resolves legacy broadcast to radio before 1950 and television from 1950", () => {
    expect(effectiveMediaOperatingModelId("legacy_broadcast", "media", 1949)).toBe("radio_network");
    expect(effectiveMediaOperatingModelId("legacy_broadcast", "media", 1950)).toBe("broadcast_tv");
  });

  it("uses explicit catalogued models when they are available for the sector and year", () => {
    expect(effectiveMediaOperatingModelId("broadcast_tv", "media", 1950)).toBe("broadcast_tv");
    expect(effectiveMediaOperatingModelId("film_studio", "media_entertainment", 1910)).toBe(
      "film_studio"
    );
    expect(effectiveMediaOperatingModelId("streaming_platform", "media", 2005)).toBe(
      "streaming_platform"
    );
  });

  it("returns undefined for non-media, unmapped, mismatched, unavailable, or unknown-year inputs", () => {
    expect(effectiveMediaOperatingModelId("newspaper", "manufacturing", 1953)).toBeUndefined();
    expect(effectiveMediaOperatingModelId("film_studio", "media", 1953)).toBeUndefined();
    expect(effectiveMediaOperatingModelId("streaming_platform", "media", 2004)).toBeUndefined();
    expect(effectiveMediaOperatingModelId("legacy_broadcast", "media", 1919)).toBeUndefined();
    expect(effectiveMediaOperatingModelId("retired_strategy", "media", 2000)).toBeUndefined();
    expect(effectiveMediaOperatingModelId("newspaper", "media", undefined)).toBeUndefined();
  });

  it("points every paid technology prerequisite at a node in its existing sector lane", () => {
    for (const model of MEDIA_OPERATING_MODELS) {
      for (const [sectorType, technology] of Object.entries(model.technologies)) {
        const node = TECH_TREE[sectorType as "media" | "media_entertainment"].find(
          (candidate) =>
            candidate.decadeId === technology.decade && candidate.name === technology.nodeName
        );
        expect(
          node?.effects.some(
            (effect) => effect.kind === "unlockStrategy" && effect.strategyId === model.id
          ),
          `${model.id} on ${sectorType}`
        ).toBe(true);
      }
    }
  });

  it("puts the whole legacy base-value budget on advertising", () => {
    const rates = mediaOperatingModelOutputRates(
      { advertising: 0.2, software: 0.4 },
      { advertising: 1 }
    );
    expect(rates).toEqual({ advertising: 0.6000000000000001 });
  });

  it("rejects empty, invalid, or non-normalized value shares", () => {
    expect(mediaOperatingModelOutputRates({ advertising: 0.5 }, {})).toEqual({});
    expect(mediaOperatingModelOutputRates({ advertising: 0.5 }, { advertising: 0.8 })).toEqual({});
    expect(mediaOperatingModelOutputRates({ advertising: Number.NaN }, { advertising: 1 })).toEqual(
      {}
    );
  });
});

describe("post-2005 media operating models", () => {
  it("makes social platforms the incumbent model of the 2027 world", () => {
    expect(effectiveMediaOperatingModelId("social_platform", "media", 2027)).toBe(
      "social_platform"
    );
    expect(effectiveMediaOperatingModelId("creator_network", "media", 2027)).toBe(
      "creator_network"
    );
    expect(effectiveMediaOperatingModelId("ai_generated_media", "media", 2027)).toBeUndefined();
    expect(
      effectiveMediaOperatingModelId("immersive_media", "media_entertainment", 2027)
    ).toBeUndefined();
  });

  it("opens AI-generated media in 2030 and immersive media in 2040", () => {
    expect(effectiveMediaOperatingModelId("ai_generated_media", "media", 2029)).toBeUndefined();
    expect(effectiveMediaOperatingModelId("ai_generated_media", "media", 2030)).toBe(
      "ai_generated_media"
    );
    expect(
      effectiveMediaOperatingModelId("immersive_media", "media_entertainment", 2039)
    ).toBeUndefined();
    expect(effectiveMediaOperatingModelId("immersive_media", "media_entertainment", 2040)).toBe(
      "immersive_media"
    );
    expect(effectiveMediaOperatingModelId("immersive_media", "media", 2045)).toBeUndefined();
  });
});

describe("post-2005 media model economics", () => {
  const strategy = (sector: string, id: string) =>
    getMediaOperatingModelStrategies(sector).find((s) => s.id === id)!;
  const inputTotal = (demand: Record<string, number | undefined>) =>
    Object.values(demand).reduce<number>((t, v) => t + (v ?? 0), 0);

  it("builds a priced strategy for every new model on every lane it lists", () => {
    for (const id of ["social_platform", "creator_network", "ai_generated_media"]) {
      expect(strategy("media", id).requiresTechUnlock).toBe(true);
      expect(strategy("media", id).supply.advertising).toBeGreaterThan(0);
    }
    for (const id of ["creator_network", "ai_generated_media", "immersive_media"]) {
      expect(strategy("media_entertainment", id).supply.advertising).toBeGreaterThan(0);
    }
  });

  it("charges AI-generated media heavy compute, energy and network inputs", () => {
    const ai = strategy("media", "ai_generated_media").demand;
    const social = strategy("media", "social_platform").demand;
    expect(ai.network_services ?? 0).toBeGreaterThan(0);
    expect(ai.energy ?? 0).toBeGreaterThan(0);
    expect(inputTotal(ai)).toBeGreaterThan(inputTotal(social));
  });
});
