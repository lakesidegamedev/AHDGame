import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/api/requireBotToken", () => ({ requireBotToken: vi.fn() }));
vi.mock("@/lib/suggestions/completionAnnouncement", () => ({
  announcePendingSuggestionCompletions: vi.fn().mockResolvedValue(2),
}));

import { POST } from "./route";
import { requireBotToken } from "@/lib/api/requireBotToken";
import { announcePendingSuggestionCompletions } from "@/lib/suggestions/completionAnnouncement";

const req = () =>
  new Request("http://localhost/api/discord-bot/suggestions/announce", { method: "POST" });

describe("POST /api/discord-bot/suggestions/announce", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects without the bot token", async () => {
    vi.mocked(requireBotToken).mockReturnValue(false);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(announcePendingSuggestionCompletions).not.toHaveBeenCalled();
  });

  it("runs the announcement sweep and reports how many posted", async () => {
    vi.mocked(requireBotToken).mockReturnValue(true);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posted: 2 });
  });
});
