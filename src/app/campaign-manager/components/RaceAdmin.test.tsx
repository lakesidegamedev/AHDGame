// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { RaceAdmin } from "./RaceAdmin";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Done" })));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true)
  );
});

const props = {
  electionId: "e1",
  inPrimary: false,
  isEnded: false,
  candidates: [
    { id: "c1", name: "Grant Pruitt" },
    { id: "c2", name: "Marcus Hale" },
  ],
};

describe("RaceAdmin", () => {
  it("renders nothing for a non-admin", () => {
    const { container } = renderWithElectionsMessages(
      <RaceAdmin {...props} isAdmin={false} onDone={() => {}} />
    );
    expect(container.textContent).toBe("");
  });

  it("resolves the race through the admin route", async () => {
    const onDone = vi.fn();
    renderWithElectionsMessages(<RaceAdmin {...props} isAdmin onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve election" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/elections/e1/resolve", { method: "POST" });
  });

  it("removes a candidate after confirming", async () => {
    const onDone = vi.fn();
    renderWithElectionsMessages(<RaceAdmin {...props} isAdmin onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Marcus Hale" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledWith("Remove this candidate from the race?");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/elections/e1/remove-candidate",
      expect.objectContaining({ body: JSON.stringify({ candidateId: "c2" }) })
    );
  });
});
