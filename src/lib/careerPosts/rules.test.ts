import { describe, expect, it } from "vitest";
import type { CareerEvent, CareerPostHolding } from "@/lib/db/types/character";
import { internationalLeaderLabel, officeKey, planCareerSync, type HeldPost } from "./rules";

const NOW = new Date("2026-11-21T12:00:00Z");
const EARLIER = new Date("2026-10-01T12:00:00Z");

function post(overrides: Partial<HeldPost> = {}): HeldPost {
  return {
    characterId: "c1",
    key: "org:UN",
    label: "Secretary-General, United Nations",
    category: "international",
    since: null,
    ...overrides,
  };
}

function holding(overrides: Partial<CareerPostHolding> = {}): CareerPostHolding {
  return {
    key: "org:UN",
    label: "Secretary-General, United Nations",
    category: "international",
    since: EARLIER,
    ...overrides,
  };
}

describe("planCareerSync", () => {
  it("records a newly taken post, dated from the source when it has a date", () => {
    const plan = planCareerSync({
      stored: [],
      held: [post({ since: EARLIER })],
      history: [],
      now: NOW,
    });
    expect(plan.events).toEqual([
      {
        type: "took_post",
        officeLabel: "Secretary-General, United Nations",
        postCategory: "international",
        postKey: "org:UN",
        date: EARLIER,
      },
    ]);
    expect(plan.next.map((p) => p.key)).toEqual(["org:UN"]);
    expect(plan.changed).toBe(true);
  });

  it("dates a taken post now when the source has no start date", () => {
    const plan = planCareerSync({ stored: undefined, held: [post()], history: [], now: NOW });
    expect(plan.events[0]?.date).toEqual(NOW);
  });

  it("writes nothing while a post is still held", () => {
    const plan = planCareerSync({
      stored: [holding()],
      held: [post()],
      history: [],
      now: NOW,
    });
    expect(plan.events).toEqual([]);
    expect(plan.changed).toBe(false);
  });

  it("records leaving a post", () => {
    const plan = planCareerSync({ stored: [holding()], held: [], history: [], now: NOW });
    expect(plan.events).toEqual([
      {
        type: "left_post",
        officeLabel: "Secretary-General, United Nations",
        postCategory: "international",
        postKey: "org:UN",
        date: NOW,
      },
    ]);
    expect(plan.next).toEqual([]);
  });

  it("collapses duplicate holder rows for the same post", () => {
    const plan = planCareerSync({ stored: [], held: [post(), post()], history: [], now: NOW });
    expect(plan.events).toHaveLength(1);
  });

  describe("offices", () => {
    const senate = { type: "senate", state: "OH" } as const;
    const senateKey = officeKey(senate);

    it("tracks a held office without writing an event (election already did)", () => {
      const plan = planCareerSync({
        stored: [],
        held: [
          post({ key: senateKey, label: "US Senate (OH)", category: "office", office: senate }),
        ],
        history: [],
        now: NOW,
      });
      expect(plan.events).toEqual([]);
      expect(plan.next[0]?.office).toEqual(senate);
      expect(plan.changed).toBe(true);
    });

    const stored = [
      holding({ key: senateKey, label: "US Senate (OH)", category: "office", office: senate }),
    ];

    it("records leaving office when the term ends with no exit on record", () => {
      const history: CareerEvent[] = [
        { type: "elected", office: senate, officeLabel: "US Senate (OH)", date: EARLIER },
      ];
      const plan = planCareerSync({ stored, held: [], history, now: NOW });
      expect(plan.events).toEqual([
        { type: "left_office", office: senate, officeLabel: "US Senate (OH)", date: NOW },
      ]);
    });

    it.each(["resigned", "removed", "lost_election"] as const)(
      "does not double up when the latest event is %s",
      (type) => {
        const history: CareerEvent[] = [
          { type: "elected", office: senate, officeLabel: "US Senate (OH)", date: EARLIER },
          { type, office: { ...senate, senateClass: 1 }, officeLabel: "US Senate (OH)", date: NOW },
        ];
        const plan = planCareerSync({ stored, held: [], history, now: NOW });
        expect(plan.events).toEqual([]);
        expect(plan.next).toEqual([]);
        expect(plan.changed).toBe(true);
      }
    );

    it("keeps an office held through a second record (MP who became PM)", () => {
      const commons = { type: "commons", state: "London" };
      const plan = planCareerSync({
        stored: [
          holding({
            key: officeKey(commons),
            label: "MP",
            category: "office",
            office: commons,
          }),
        ],
        held: [
          post({
            key: officeKey({ type: "primeMinister" }),
            category: "office",
            office: { type: "primeMinister" },
          }),
          post({ key: officeKey(commons), category: "office", office: commons }),
        ],
        history: [],
        now: NOW,
      });
      expect(plan.events).toEqual([]);
    });
  });
});

describe("officeKey", () => {
  it("ignores seat counts and classes", () => {
    expect(officeKey({ type: "house", state: "CA", seatsHeld: 1 })).toBe(
      officeKey({ type: "house", state: "CA", seatsHeld: 3 })
    );
    expect(officeKey({ type: "senate", state: "OH", senateClass: 1 })).toBe(
      officeKey({ type: "senate", state: "OH" })
    );
  });

  it("separates cabinet posts", () => {
    expect(officeKey({ type: "usCabinet", positionId: "state" })).not.toBe(
      officeKey({ type: "usCabinet", positionId: "treasury" })
    );
  });
});

describe("internationalLeaderLabel", () => {
  it("joins title and org name", () => {
    expect(internationalLeaderLabel("Secretary-General", "United Nations")).toBe(
      "Secretary-General, United Nations"
    );
  });

  it("keeps a title that already names its org", () => {
    expect(
      internationalLeaderLabel("Secretary-General of the Minerals Club", "Minerals Club")
    ).toBe("Secretary-General of the Minerals Club");
  });
});
