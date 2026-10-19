import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Suggestion } from "@/lib/db/types/suggestion";
import {
  buildSuggestionCompletedEmbed,
  isSuggestionDoneStatus,
  suggestionImplementationNote,
} from "./completionAnnouncement";

function suggestion(over: Partial<Suggestion>): Suggestion {
  return {
    _id: new ObjectId(),
    issueNumber: 379,
    userId: null,
    category: "ui_improvement",
    gameSystem: "corporations",
    title: "Mass mothball button",
    description: "",
    commentCount: 0,
    context: {} as Suggestion["context"],
    status: "completed",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("isSuggestionDoneStatus", () => {
  it("treats the site and support tooling done statuses alike", () => {
    expect(isSuggestionDoneStatus("completed")).toBe(true);
    expect(isSuggestionDoneStatus("implemented")).toBe(true);
    expect(isSuggestionDoneStatus("planned")).toBe(false);
    expect(isSuggestionDoneStatus(undefined)).toBe(false);
  });
});

describe("suggestionImplementationNote", () => {
  it("prefers the explicit note", () => {
    const s = suggestion({ implementationNote: " Shipped. ", adminNotes: "internal" });
    expect(suggestionImplementationNote(s)).toBe("Shipped.");
  });

  it("falls back to the latest done status history note", () => {
    const s = suggestion({
      statusHistory: [
        { status: "planned", at: new Date(), note: "queued" },
        { status: "implemented", at: new Date(), note: "Bulk mothball is live." },
      ],
    });
    expect(suggestionImplementationNote(s)).toBe("Bulk mothball is live.");
  });

  it("falls back to admin notes, then null", () => {
    expect(suggestionImplementationNote(suggestion({ adminNotes: "Done in 1.13" }))).toBe(
      "Done in 1.13"
    );
    expect(suggestionImplementationNote(suggestion({}))).toBeNull();
  });
});

describe("buildSuggestionCompletedEmbed", () => {
  const base = {
    issueNumber: 379,
    title: "Mass mothball button",
    whatWasDone: "Mothball or reactivate every sector at once.",
    reporterName: "Jane Doe",
    implementedCount: 3,
    detailUrl: "https://example.test/feedback/379",
  };

  it("shows what changed, the title and the reporter", () => {
    const embed = buildSuggestionCompletedEmbed(base);
    expect(embed.title).toBe("Implemented: S#379");
    expect(embed.description).toContain("Mass mothball button");
    expect(embed.author?.name).toBe("Jane Doe");
    const fields = Object.fromEntries((embed.fields ?? []).map((f) => [f.name, f.value]));
    expect(fields["What changed"]).toBe(base.whatWasDone);
    expect(fields["Suggested by"]).toBe("Jane Doe");
    expect(fields["Track record"]).toBe("3 implemented suggestions");
  });

  it("marks a first implemented suggestion and handles a missing note", () => {
    const embed = buildSuggestionCompletedEmbed({
      ...base,
      whatWasDone: null,
      implementedCount: 1,
    });
    const fields = Object.fromEntries((embed.fields ?? []).map((f) => [f.name, f.value]));
    expect(fields["What changed"]).toBe("Now live in the game.");
    expect(fields["Track record"]).toBe("Their first implemented suggestion");
  });

  it("keeps the note inside the Discord field limit", () => {
    const embed = buildSuggestionCompletedEmbed({ ...base, whatWasDone: "x".repeat(3000) });
    const note = embed.fields?.find((f) => f.name === "What changed")?.value ?? "";
    expect(note.length).toBeLessThanOrEqual(1024);
  });
});
