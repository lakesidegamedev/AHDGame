/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExecutiveStatusBanner } from "./ExecutiveStatusBanner";

const succession = {
  stage: "acting" as const,
  office: "president",
  actingLabel: "Prime Minister",
  fill: "direct_election" as const,
  vacatedTurn: 1,
  actingUntilTurn: 169,
  fillByTurn: 337,
  summary: "Office vacant. Prime Minister is acting until a special election.",
};

afterEach(cleanup);

describe("ExecutiveStatusBanner", () => {
  it("renders nothing when there is no succession or caretaker state", () => {
    const { container } = render(
      <ExecutiveStatusBanner status={{ succession: null, caretaker: null }} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows the succession summary", () => {
    render(<ExecutiveStatusBanner status={{ succession, caretaker: null }} />);
    expect(screen.getByTestId("executive-status-banner").textContent).toContain(
      "Prime Minister is acting"
    );
  });

  it("shows caretaker mode", () => {
    render(
      <ExecutiveStatusBanner
        status={{
          succession: null,
          caretaker: { sinceTurn: 3, reason: "dissolution", outgoingLeaderName: null },
        }}
      />
    );
    expect(screen.getByTestId("executive-status-banner").textContent).toContain(
      "Caretaker government"
    );
  });
});
