import { describe, expect, it, vi } from "vitest";
import { ukLeadershipChallengesCollection } from "./ukLeadershipChallenges";
import type { CollectionSource } from "./source";

describe("ukLeadershipChallenges repository", () => {
  it("opens ukLeadershipChallenges on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukLeadershipChallengesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukLeadershipChallenges");
    expect(handle).toEqual({ name: "ukLeadershipChallenges" });
  });
});
