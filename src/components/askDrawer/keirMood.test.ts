import { describe, expect, it } from "vitest";
import { finishMood, keirMood, longWaitMood, moodForStatus, type KeirMoodInput } from "./keirMood";

const base: KeirMoodInput = {
  busy: false,
  answering: false,
  alerting: false,
  flash: null,
  stepMood: "thinking",
  quietPeriods: 0,
  typing: false,
  rest: null,
};

describe("moodForStatus", () => {
  it("follows the phase Ask tags a step with", () => {
    expect(moodForStatus("anything", "search")).toBe("reading");
    expect(moodForStatus("anything", "read")).toBe("reading");
    expect(moodForStatus("anything", "live")).toBe("working");
    expect(moodForStatus("anything", "calc")).toBe("working");
    expect(moodForStatus("anything", "chart")).toBe("point");
    expect(moodForStatus("anything", "plan")).toBe("thinking");
  });

  it("falls back to the label's wording", () => {
    expect(moodForStatus("Searching the wiki")).toBe("reading");
    expect(moodForStatus("Reading the election code")).toBe("reading");
    expect(moodForStatus("Checking live game data")).toBe("working");
    expect(moodForStatus("Calculating the tax take")).toBe("working");
    expect(moodForStatus("Drawing a chart")).toBe("point");
    expect(moodForStatus("Mulling it over")).toBe("thinking");
    expect(moodForStatus(undefined, "unknown-phase")).toBe("thinking");
  });
});

describe("keirMood", () => {
  it("shows the alert before talking, then talks while words stream", () => {
    expect(keirMood({ ...base, busy: true, answering: true, alerting: true })).toBe("alert");
    expect(keirMood({ ...base, busy: true, answering: true })).toBe("talking");
  });

  it("nods at the ack, then follows the research step", () => {
    expect(keirMood({ ...base, busy: true, flash: "nod", stepMood: "reading" })).toBe("nod");
    expect(keirMood({ ...base, busy: true, stepMood: "reading" })).toBe("reading");
  });

  it("rotates waiting states when a step goes quiet", () => {
    const moods = [1, 2, 3].map((quietPeriods) =>
      keirMood({ ...base, busy: true, stepMood: "working", quietPeriods })
    );
    expect(moods).toEqual(["thinking", "glasses_peek", "tea_sip"]);
    expect(longWaitMood(3)).toBe("thinking");
  });

  it("listens while the player types and sleeps when left alone", () => {
    expect(keirMood({ ...base, typing: true })).toBe("listening");
    expect(keirMood(base)).toBe("idle");
    expect(keirMood({ ...base, rest: "sleeping", typing: true })).toBe("sleeping");
    expect(keirMood({ ...base, rest: "waking" })).toBe("waking");
  });
});

describe("finishMood", () => {
  it("reacts to how the answer went", () => {
    expect(finishMood({ usedMcp: true })).toBe("thumbs_up");
    expect(finishMood({})).toBe("idea");
    expect(finishMood({ error: "nope" })).toBe("error");
    expect(finishMood({ error: "limit", quota: true })).toBe("concerned");
    expect(finishMood({ stopped: true })).toBe("shrug");
  });
});
