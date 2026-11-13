// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { CharacterRecap } from "@/lib/recap/types";
import { SeasonRecapStory } from "./SeasonRecapStory";
import { buildStory } from "./wrapped/story";

function recap(): CharacterRecap {
  return {
    schemaVersion: 1,
    characterId: "6a77b65918e42bc9dfb15aca",
    name: "P",
    party: "Labour",
    countryId: "UK",
    iteration: null,
    tenureTurns: 100,
    highestOffice: null,
    actions: {
      total: 120,
      byType: { VOTE: 60, DONATE: 30, CAMPAIGN: 20, ENDORSE: 10 } as never,
      topType: "VOTE" as never,
      rank: null,
    },
    influence: {
      politicalInfluence: 0,
      nationalInfluence: 0,
      npi: { value: 0, rank: 3, total: 3 },
    },
    favorability: null,
    infamy: 0,
    netWorth: null,
    campaignFunds: null,
    elections: { entered: 0, won: 0, lost: 0 },
    bills: { sponsored: 0, passed: 0 },
    social: null,
    achievements: { count: 0, highlights: [] },
  };
}

function mockMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
}

const current = () => document.body.querySelector("[data-slide]")?.getAttribute("data-slide");

describe("SeasonRecapStory timing", () => {
  const data = recap();
  const story = buildStory(data);

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("with motion on, advances on its own timer without any animation events", () => {
    mockMotion(false);
    const onClose = vi.fn();
    render(<SeasonRecapStory recap={data} onClose={onClose} />);
    expect(current()).toBe(story[0].kind);
    act(() => {
      vi.advanceTimersByTime(story[0].ms + 100);
    });
    expect(current()).toBe(story[1].kind);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("with motion on, holds the guess slide until answered, then plays on", () => {
    mockMotion(false);
    render(<SeasonRecapStory recap={data} onClose={vi.fn()} />);
    const guessAt = story.findIndex((s) => s.kind === "guess");
    for (let i = 0; i < guessAt; i++) {
      act(() => {
        vi.advanceTimersByTime(story[i].ms + 100);
      });
    }
    expect(current()).toBe("guess");
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(current()).toBe("guess");
    fireEvent.click(document.body.querySelectorAll("[data-slide] button")[0]);
    act(() => {
      vi.advanceTimersByTime(story[guessAt].ms + 100);
    });
    expect(current()).toBe(story[guessAt + 1].kind);
  });

  it("with reduced motion, shows every slide in order and never skips or closes", () => {
    mockMotion(true);
    const onClose = vi.fn();
    const { getByLabelText, getByText } = render(
      <SeasonRecapStory recap={data} onClose={onClose} />
    );
    expect(getByText("Tap to continue")).toBeTruthy();
    for (let i = 0; i < story.length; i++) {
      expect(current()).toBe(story[i].kind);
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(current()).toBe(story[i].kind);
      if (i < story.length - 1) fireEvent.click(getByLabelText("Next"));
    }
    expect(current()).toBe("finale");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("with reduced motion, the reveal after the question stays until the player moves on", () => {
    mockMotion(true);
    const { getByLabelText } = render(<SeasonRecapStory recap={data} onClose={vi.fn()} />);
    const guessAt = story.findIndex((s) => s.kind === "guess");
    for (let i = 0; i < guessAt; i++) fireEvent.click(getByLabelText("Next"));
    expect(current()).toBe("guess");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(current()).toBe("guess");
    fireEvent.click(document.body.querySelectorAll("[data-slide] button")[0]);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(current()).toBe("guess");
    fireEvent.click(getByLabelText("Next"));
    expect(current()).toBe(story[guessAt + 1].kind);
  });
});
