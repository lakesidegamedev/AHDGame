import { afterEach, describe, expect, it, vi } from "vitest";
import { organizationVoteHandler, postOrganizationAction } from "./proposalActions";

afterEach(() => vi.unstubAllGlobals());

describe("organization action requests", () => {
  it("posts the payload without reading a successful response", async () => {
    const json = vi.fn().mockRejectedValue(new Error("No JSON"));
    const fetch = vi.fn().mockResolvedValue({ ok: true, json });
    vi.stubGlobal("fetch", fetch);
    await postOrganizationAction("/proposal", { type: "set_dues", duesRateAnnual: 0 }, "Failed");
    expect(fetch).toHaveBeenCalledWith("/proposal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"type":"set_dues","duesRateAnnual":0}',
    });
    expect(json).not.toHaveBeenCalled();
  });

  it.each([
    [{ error: "Treasury is empty" }, "Treasury is empty"],
    [{}, "Proposal failed"],
  ])("preserves API errors and the panel fallback for %j", async (body, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => body }));
    await expect(postOrganizationAction("/proposal", {}, "Proposal failed")).rejects.toThrow(
      message
    );
  });

  it("uses the fallback for a non-JSON error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockRejectedValue(new SyntaxError("HTML")),
      })
    );
    await expect(postOrganizationAction("/proposal", {}, "Proposal failed")).rejects.toThrow(
      "Proposal failed"
    );
  });

  it("propagates network errors unchanged", async () => {
    const error = new TypeError("Offline");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    await expect(postOrganizationAction("/proposal", {}, "Proposal failed")).rejects.toBe(error);
  });
});

describe("organization votes", () => {
  for (const ballot of ["legislation", "leadership-elections", "proposals"] as const) {
    it.each(["yes", "no", "abstain"] as const)(
      `posts a %s vote on ${ballot} and refreshes after success`,
      async (value) => {
        const order: string[] = [];
        const fetch = vi.fn(async () => {
          order.push("request");
          return { ok: true };
        });
        vi.stubGlobal("fetch", fetch);
        const onChange = vi.fn(() => {
          order.push("refresh");
        });
        await organizationVoteHandler("US", onChange, ballot)("ballot-id", value);
        expect(fetch).toHaveBeenCalledWith(
          `/api/country/US/international-organizations/${ballot}/ballot-id/vote`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ vote: value }),
          }
        );
        expect(order).toEqual(["request", "refresh"]);
        expect(onChange).toHaveBeenCalledOnce();
      }
    );
  }

  it("refuses a vote without a diplomatic country", async () => {
    const fetch = vi.fn();
    const onChange = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      organizationVoteHandler(null, onChange, "legislation")("id", "yes")
    ).rejects.toThrow("No diplomatic role");
    expect(fetch).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "does not refresh after an unsuccessful vote (invalid JSON: %s)",
    async (invalid) => {
      const onChange = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          json: invalid
            ? vi.fn().mockRejectedValue(new SyntaxError())
            : async () => ({ error: "Not eligible" }),
        })
      );
      await expect(
        organizationVoteHandler("US", onChange, "legislation")("id", "no")
      ).rejects.toThrow(invalid ? "Vote failed" : "Not eligible");
      expect(onChange).not.toHaveBeenCalled();
    }
  );
});
