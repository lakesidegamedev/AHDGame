import { describe, expect, it } from "vitest";
import { buildOpsTreeView } from "./campaignView";

const tree = { starter: true, a: 2, b: 0, c: 0 };
const toLocal = (amount: number) => amount * 0.35808;

describe("campaign operation income previews", () => {
  it("quotes the next grassroots tier in the same era units as its cost", () => {
    const view = buildOpsTreeView("fundraising", tree, false, false, toLocal);
    expect(view.branches[0].next?.funds).toBe(537120);
    expect(view.branches[0].next?.effect).toBe("+$644,544/turn");
    expect(view.branches[0].currentEffect).toBe("+$250,656/turn");
    expect(view.starterEffect).toBe("+$12,533/turn base income");
  });
  it("converts monetary benefits into the campaign's currency", () => {
    const view = buildOpsTreeView("fundraising", tree, false, false, (n) => n * 2, "£");
    expect(view.branches[0].currentEffect).toBe("+£1,400,000/turn");
    expect(view.branches[0].next?.effect).toBe("+£3,600,000/turn");
    expect(view.branches[1].next?.effect).toBe("+£500,000 on purchase");
    expect(view.branches[2].next?.effect).toBe("+15% income");
  });
  it("does not claim a standing grant for locked operations", () => {
    const view = buildOpsTreeView(
      "fundraising",
      { ...tree, starter: false },
      false,
      false,
      toLocal
    );
    expect(view.branches[0].currentEffect).toBe("No effect");
    expect(view.starterCost?.effect).toBe(view.starterEffect);
  });
});
