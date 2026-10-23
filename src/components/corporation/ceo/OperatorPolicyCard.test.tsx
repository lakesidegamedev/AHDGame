/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OperatorPolicyCard } from "./OperatorPolicyCard";
import { matchOperatorPreset, OPERATOR_PRESETS } from "@/lib/turn/npp/rules/operatorPresets";

const defaults = {
  found: "allow",
  grow: "allow",
  divest: "ask",
  retool: "never",
  borrow: "never",
  budgets: "allow",
  dividends: "allow",
  research: "ask",
};

let calls: Array<{ url: string; init?: RequestInit }>;

function mockFetch(policy: unknown = null) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      return {
        ok: true,
        json: async () => ({
          policy: body ?? policy,
          effective: { role: "autopilot", actions: { ...defaults, ...(body?.actions ?? {}) } },
        }),
      };
    })
  );
}

beforeEach(() => mockFetch());
afterEach(() => vi.unstubAllGlobals());

describe("OperatorPolicyCard", () => {
  it("applies an attitude with one click", async () => {
    render(<OperatorPolicyCard corpId="c1" />);
    fireEvent.click(await screen.findByText("Advise only"));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(JSON.parse(String(put.init!.body)).actions).toMatchObject({
      budgets: "never",
      grow: "never",
    });
  });

  it("clears the policy for the standard attitude", async () => {
    render(<OperatorPolicyCard corpId="c1" />);
    fireEvent.click(await screen.findByText("Standard"));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "DELETE")).toBe(true));
  });

  it("asks for confirmation before allowing sell or close, then saves", async () => {
    render(<OperatorPolicyCard corpId="c1" />);
    const select = await screen.findByLabelText("Sell or close plants");
    fireEvent.change(select, { target: { value: "allow" } });
    expect(screen.getByText(/you receive nothing for it/)).toBeTruthy();
    expect(calls.some((c) => c.init?.method === "PUT")).toBe(false);
    fireEvent.click(screen.getByText("Allow it"));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    expect(
      JSON.parse(String(calls.find((c) => c.init?.method === "PUT")!.init!.body)).actions.divest
    ).toBe("allow");
  });

  it("offers Tell me only for actions that can send an advisory", async () => {
    render(<OperatorPolicyCard corpId="c1" />);
    const grow = (await screen.findByLabelText("Grow plants")) as HTMLSelectElement;
    const divest = screen.getByLabelText("Sell or close plants") as HTMLSelectElement;
    expect([...grow.options].map((o) => o.text)).toEqual(["Allowed", "Never"]);
    expect([...divest.options].map((o) => o.text)).toEqual(["Allowed", "Tell me", "Never"]);
  });
});

describe("matchOperatorPreset", () => {
  it("round-trips every preset and calls anything else custom", () => {
    for (const preset of OPERATOR_PRESETS) {
      expect(matchOperatorPreset(preset.actions)).toBe(preset.id);
    }
    expect(matchOperatorPreset({ grow: "never" })).toBeNull();
    expect(matchOperatorPreset(undefined)).toBe("default");
  });
});
