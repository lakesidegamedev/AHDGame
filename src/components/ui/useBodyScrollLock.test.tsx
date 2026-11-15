// @vitest-environment happy-dom
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useBodyScrollLock } from "./useBodyScrollLock";

afterEach(cleanup);
function Lock({ open = true }: { open?: boolean }) {
  useBodyScrollLock(open);
  return null;
}

it("keeps nested dialogs locked and restores existing page styles after the last closes", () => {
  document.body.style.overflow = "auto";
  document.documentElement.style.overflow = "scroll";
  const first = render(<Lock />);
  const second = render(<Lock />);
  expect(document.body.style.overflow).toBe("hidden");
  first.unmount();
  expect(document.documentElement.style.overflow).toBe("hidden");
  second.unmount();
  expect(document.body.style.overflow).toBe("auto");
  expect(document.documentElement.style.overflow).toBe("scroll");
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

it("releases the lock when an existing dialog closes", () => {
  const view = render(<Lock open={false} />);
  expect(document.body.style.overflow).toBe("");
  view.rerender(<Lock />);
  expect(document.body.style.overflow).toBe("hidden");
  view.rerender(<Lock open={false} />);
  expect(document.body.style.overflow).toBe("");
});
