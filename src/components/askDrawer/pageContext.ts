// What the player is looking at, captured in their browser when they ask.
// Only rendered text inside <main> is read (innerText skips hidden elements),
// so the drawer, navbar and footer never leak into it.

export interface AskPageContext {
  path: string;
  title: string;
  heading: string;
  text: string;
}

export const MAX_PAGE_TEXT = 6000;

export function normalizePageText(raw: string, max = MAX_PAGE_TEXT): string {
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (out[out.length - 1] === line) continue;
    if (size + line.length + 1 > max) break;
    out.push(line);
    size += line.length + 1;
  }
  return out.join("\n");
}

export function capturePageContext(doc: Document = document): AskPageContext {
  const main = doc.getElementById("main-content") ?? doc.querySelector("main");
  const heading = main?.querySelector("h1")?.textContent ?? "";
  return {
    path: doc.location?.pathname ?? "",
    title: doc.title.replace(/\s*[|·-]\s*A House Divided\s*$/i, "").trim(),
    heading: heading.replace(/\s+/g, " ").trim().slice(0, 200),
    text: normalizePageText((main as HTMLElement | null)?.innerText ?? ""),
  };
}

/** Short label for the "sharing this page" chip. */
export function pageLabel(context: Pick<AskPageContext, "title" | "heading" | "path">): string {
  return context.heading || context.title || context.path || "This page";
}
