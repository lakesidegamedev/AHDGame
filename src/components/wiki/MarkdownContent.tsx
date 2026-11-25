"use client";

import Link from "next/link";
import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { expandWikiTags } from "@/lib/wiki/rules/embedTags";
import { toRelativeWikiHref } from "@/lib/wiki/links";
import { getWikiComponent } from "@/lib/wiki/componentRegistry";
import { SKIP_GLOSSARY_PROP, wrapGlossaryChildren } from "@/components/wiki/wrapGlossaryChildren";
import { WikiGuideScreenshot } from "@/components/wiki/WikiGuideScreenshot";

const WIKI_LINK = /^\/wiki\//;

// Only allow images from http(s), protocol-relative, or same-origin absolute paths.
// react-markdown already blocks javascript: URLs, but keep an explicit allow-list.
function isSafeImageSrc(src: string | undefined): src is string {
  if (!src) return false;
  if (src.startsWith("/") || src.startsWith("//")) return true;
  try {
    const u = new URL(src);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export interface TocHeading {
  id: string;
  text: string;
  level: number;
}

function toAnchorId(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function MarkdownContent({ content }: { content: string; headings?: TocHeading[] }) {
  const usedGlossary = new Set<string>();
  const wrap = (children: ReactNode) => wrapGlossaryChildren(children, usedGlossary);
  const noGlossary = { [SKIP_GLOSSARY_PROP]: "" };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href: rawHref, children }) => {
          const href = rawHref ? toRelativeWikiHref(rawHref) : rawHref;
          if (href && (href.startsWith("/") || WIKI_LINK.test(href))) {
            return (
              <Link href={href} className="text-[var(--wiki-link)] hover:underline" {...noGlossary}>
                {children}
              </Link>
            );
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--wiki-link)] hover:underline"
              {...noGlossary}
            >
              {children}
            </a>
          );
        },
        h1: ({ children }) => (
          <h1
            className="mb-3 mt-8 text-display font-extrabold leading-[1.15] tracking-[-0.03em] text-foreground first:mt-0"
            {...noGlossary}
          >
            {children}
          </h1>
        ),
        h2: ({ children }) => {
          const text =
            typeof children === "string"
              ? children
              : Array.isArray(children)
                ? children.join("")
                : String(children);
          const id = toAnchorId(text);
          return (
            <h2
              id={id}
              className="mb-3 mt-8 scroll-mt-24 text-heading font-extrabold leading-[1.15] tracking-[-0.03em] text-foreground"
              {...noGlossary}
            >
              {children}
            </h2>
          );
        },
        h3: ({ children }) => {
          const text =
            typeof children === "string"
              ? children
              : Array.isArray(children)
                ? children.join("")
                : String(children);
          const id = toAnchorId(text);
          return (
            <h3
              id={id}
              className="mb-2 mt-5 scroll-mt-24 text-body-lg font-bold leading-[1.15] tracking-[-0.01em] text-foreground"
              {...noGlossary}
            >
              {children}
            </h3>
          );
        },
        p: ({ children }) => (
          <p className="mb-3 text-body leading-[1.6] text-foreground/80">{wrap(children)}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 ml-5 list-disc space-y-1.5 text-body text-foreground/80">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 ml-5 list-decimal space-y-1.5 text-body text-foreground/80">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-[1.6]">{wrap(children)}</li>,
        table: ({ children }) => (
          <div className="mb-5 overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-body-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children, style }) => (
          <th
            style={style}
            className="border-b border-card-border py-1.5 pr-2.5 text-left text-body-sm font-semibold uppercase tracking-[0.06em] text-muted"
          >
            {wrap(children)}
          </th>
        ),
        td: ({ children, style }) => (
          <td
            style={style}
            className="border-b border-card-border/60 py-2 pr-2.5 align-top tabular-nums text-foreground/80 first:font-medium first:text-foreground"
          >
            {wrap(children)}
          </td>
        ),
        blockquote: ({ children }) => (
          <blockquote
            className="mb-3 rounded-md px-3.5 py-2 text-foreground/80"
            style={{ background: "var(--card-muted)" }}
          >
            {wrap(children)}
          </blockquote>
        ),
        pre: ({ children }) => {
          const child = Children.toArray(children)[0];
          if (Children.count(children) === 1 && isValidElement(child) && child.type !== "code") {
            return <>{children}</>;
          }
          return (
            <pre
              className="mb-3.5 overflow-x-auto rounded-md px-3.5 py-3 font-mono text-body-sm leading-[1.7] text-foreground"
              style={{ background: "var(--card-muted)" }}
              {...noGlossary}
            >
              {children}
            </pre>
          );
        },
        code: ({ className, children, ...props }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            const lang = className?.replace("language-", "").trim();
            const WikiComponent = lang ? getWikiComponent(lang) : null;
            if (WikiComponent) {
              // Code-fence body is passed through as the widget's `data` prop.
              // Widgets that need a parameter (e.g. commodity type) parse it;
              // parameterless widgets ignore it.
              const rawData = String(children ?? "").trim();
              return <WikiComponent data={rawData} />;
            }
            return (
              <code className="text-foreground" {...noGlossary} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code
              className="rounded bg-card px-1 py-0.5 font-mono text-body-sm text-foreground"
              {...noGlossary}
              {...props}
            >
              {children}
            </code>
          );
        },
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{wrap(children)}</strong>
        ),
        img: ({ src, alt, title }) => {
          if (!isSafeImageSrc(typeof src === "string" ? src : undefined)) return null;
          const srcStr = src as string;
          const guideMatch = srcStr.match(/^\/wiki-images\/guides\/([^/]+)\.png$/);
          if (guideMatch) {
            return <WikiGuideScreenshot name={guideMatch[1] ?? ""} alt={alt ?? ""} />;
          }
          return (
            /* eslint-disable-next-line @next/next/no-img-element -- user content URLs aren't known at build time; next/image requires configured domains */
            <img
              src={srcStr}
              alt={alt ?? ""}
              title={title}
              loading="lazy"
              className="my-4 h-auto max-w-full rounded-md"
            />
          );
        },
      }}
    >
      {expandWikiTags(content)}
    </ReactMarkdown>
  );
}
