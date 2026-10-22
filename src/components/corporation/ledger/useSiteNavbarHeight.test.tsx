/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useSiteNavbarHeight } from "./useSiteNavbarHeight";

function Page({ startLoaded = true }: { startLoaded?: boolean }) {
  const [loaded, setLoaded] = useState(startLoaded);
  const rootRef = useSiteNavbarHeight();
  if (!loaded) {
    return (
      <button type="button" onClick={() => setLoaded(true)}>
        load
      </button>
    );
  }
  return <div ref={rootRef} data-testid="root" />;
}

function addNavbar(height: number) {
  const nav = document.createElement("nav");
  nav.setAttribute("data-site-navbar", "");
  nav.getBoundingClientRect = () => ({ height }) as DOMRect;
  document.body.prepend(nav);
  return nav;
}

afterEach(() => {
  document.querySelectorAll("[data-site-navbar]").forEach((el) => el.remove());
});

describe("useSiteNavbarHeight", () => {
  it("writes the navbar height onto the page root", () => {
    addNavbar(57);
    render(<Page />);
    expect(screen.getByTestId("root").style.getPropertyValue("--site-navbar-h")).toBe("57px");
  });

  it("measures once the page root appears after a loading state", () => {
    addNavbar(64);
    render(<Page startLoaded={false} />);
    fireEvent.click(screen.getByRole("button", { name: "load" }));
    expect(screen.getByTestId("root").style.getPropertyValue("--site-navbar-h")).toBe("64px");
  });

  it("picks up a navbar that replaced the loading one", () => {
    const placeholder = addNavbar(40);
    render(<Page />);
    placeholder.remove();
    addNavbar(72);
    fireEvent(window, new Event("resize"));
    expect(screen.getByTestId("root").style.getPropertyValue("--site-navbar-h")).toBe("72px");
  });

  it("does nothing when the site has no navbar", () => {
    render(<Page />);
    expect(screen.getByTestId("root").style.getPropertyValue("--site-navbar-h")).toBe("");
  });
});
