/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { KVList, KVRow } from "./DenseKit";

describe("KVRow layout", () => {
  it("keeps the label a readable width and lets a long note wrap", () => {
    const { container } = render(
      <KVList>
        <KVRow
          label="Marketing strength"
          value="17.12"
          hint={<span>-0.26 forecast next turn, last turn -0.27</span>}
        />
      </KVList>
    );
    const label = container.querySelector("dt");
    const figure = container.querySelector("dd");
    expect(label?.className).toContain("min-w-[6.5rem]");
    expect(figure?.className).toContain("flex-wrap");
    expect(figure?.className).not.toContain("shrink-0");
    const note = figure?.lastElementChild;
    expect(note?.className).not.toContain("shrink-0");
  });

  it("a headline row still keeps its figure and note together without shrinking", () => {
    const { container } = render(
      <KVList>
        <KVRow lead label="Revenue" value="$4.2M" hint="per turn" />
      </KVList>
    );
    expect(container.querySelector("dd")?.className).toContain("shrink-0");
  });
});
