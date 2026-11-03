// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AskChart, AskMap, isChartMermaid, richKind } from "./AskRichBlock";

describe("richKind", () => {
  it("draws Ask charts, chart-shaped Mermaid and maps, and labels other diagrams", () => {
    expect(richKind("ask-chart", '{"v":1}')).toBe("chart");
    expect(richKind("mermaid", "xychart-beta\n  title x")).toBe("chart");
    expect(richKind("mermaid", "%% note\npie title Share")).toBe("chart");
    expect(richKind("mermaid", "flowchart TD\n A-->B")).toBe("diagram");
    expect(richKind("ahd-map", "{}")).toBe("map");
    expect(richKind("ts", "const x = 1")).toBe(null);
    expect(isChartMermaid("\n\n")).toBe(false);
  });
});

describe("AskChart", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("asks the drawer proxy to draw the chart and shows its data on request", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          svg: '<svg class="akc"><g data-tip="T483\nGBP 0.46"><rect/></g></svg>',
          table: { head: ["Turn", "GBP per USD"], rows: [["T483", "0.46"]] },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const { container } = render(
      <AskChart
        source='{"v":1,"title":"USD/GBP"}'
        format="ask-chart"
        question="fx?"
        fullAskUrl="https://ask"
      />
    );
    await waitFor(() => expect(container.querySelector("svg.akc")).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ask-drawer/chart/render");
    expect(JSON.parse(init.body)).toMatchObject({
      source: '{"v":1,"title":"USD/GBP"}',
      game: "ahd",
    });
    fireEvent.click(screen.getByRole("button", { name: "Show data" }));
    expect(screen.getByText("GBP per USD")).toBeTruthy();
  });

  it("sends chart-shaped Mermaid as Mermaid", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ svg: "<svg></svg>" }), { status: 200 })
    );
    render(
      <AskChart source="pie title X" format="mermaid" question="q" fullAskUrl="https://ask" />
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ mermaid: "pie title X" });
  });

  it("offers the full site when the chart cannot be drawn", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
    render(<AskChart source="{}" format="ask-chart" question="q" fullAskUrl="https://ask" />);
    await waitFor(() => expect(screen.getByText(/could not be drawn here/)).toBeTruthy());
  });
});

describe("AskMap", () => {
  it("does not call the renderer for a malformed map", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AskMap source="{not json" fullAskUrl="https://ask" />);
    expect(screen.getByText(/could not be drawn here/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
