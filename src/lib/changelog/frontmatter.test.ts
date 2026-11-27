import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter";
const lines = [
  "---",
  "date: 2026-11-27",
  "title: Synthetic note",
  "summary: >-",
  "  A folded summary.",
  "  Continued on the next line.",
  "tags: [economy, recovery]",
  "badges: [patch]",
  "areas: [engine]",
  "---",
  "Body",
];
describe("changelog frontmatter line endings", () => {
  it.each(["\n", "\r\n"])("preserves all fields with %j line endings", (ending) => {
    expect(parseFrontmatter(lines.join(ending))).toEqual({
      data: {
        date: "2026-11-27",
        title: "Synthetic note",
        summary: "A folded summary.\nContinued on the next line.",
        tags: ["economy", "recovery"],
        badges: ["patch"],
        areas: ["engine"],
      },
      content: "Body",
    });
  });
});
