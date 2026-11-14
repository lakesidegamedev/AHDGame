import type { WikiSeedPage } from "../types";
import { beta1Content } from "../content/beta1";
import { beta2Content } from "../content/beta2";
import { iteration1Content } from "../content/iteration1";
import { iteration2Content } from "../content/iteration2";

export const iterationsPages: readonly WikiSeedPage[] = [
  {
    slug: "beta-1",
    title: "Beta 1",
    description:
      "First numbered iteration of A House Divided after the spring 2026 wipe: four nations, twenty-one parties, and 621 turns of escalation.",
    content: beta1Content,
    category: "iterations",
    extraTags: ["history", "beta", "iteration"],
    featured: false,
    difficulty: "beginner",
    contentType: "reference",
    estimatedReadTime: 12,
  },
  {
    slug: "beta-2",
    title: "Beta 2",
    description:
      "The second numbered iteration, now concluded: seven playable nations on a 1991 Cold War map, a German exit from NATO, and a British declaration of war on China.",
    content: beta2Content,
    category: "iterations",
    extraTags: ["history", "beta", "iteration"],
    featured: false,
    difficulty: "beginner",
    contentType: "reference",
    estimatedReadTime: 14,
  },
  {
    slug: "iteration-1",
    title: "Iteration 1",
    description:
      "The concluded 1953-start world: German reunification by war, seven American presidents, a fractured Cold War, and private fortunes larger than public exchanges.",
    content: iteration1Content,
    category: "iterations",
    extraTags: ["history", "iteration", "cold-war"],
    featured: false,
    difficulty: "beginner",
    contentType: "reference",
    estimatedReadTime: 27,
    lastUpdated: "2026-10-02",
  },
  {
    slug: "iteration-2",
    title: "Iteration 2",
    description:
      "The story of the 1991-start world and the characters who ran it: The Mafia's four presidential wins, a comeback from resignation, a nationalist government that broke up the United Kingdom, and a United States-Japan war left unfinished.",
    content: iteration2Content,
    category: "iterations",
    extraTags: ["history", "iteration", "post-cold-war"],
    featured: false,
    difficulty: "beginner",
    contentType: "reference",
    estimatedReadTime: 32,
    lastUpdated: "2026-11-13",
  },
];
