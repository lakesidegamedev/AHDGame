"use client";

import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { useReportedError } from "@/lib/errors/useReportedError";

interface NavigationLink {
  href: string;
  label: string;
  primary?: boolean;
}

interface ErrorPageContentProps {
  /** Error object from Next.js error boundary */
  error: Error & { digest?: string };
  /** Reset function from Next.js error boundary */
  reset: () => void;
  /** Overrides the plain-language title for the error code */
  title?: string;
  /** Page-specific lead sentence */
  description?: string;
  /** Log prefix for console.error (e.g., "Dashboard error") */
  logPrefix?: string;
  /** Navigation links to show (defaults to Dashboard) */
  navigationLinks?: NavigationLink[];
  /** Use min-h-screen (true) or min-h-[50vh] (false) */
  fullScreen?: boolean;
}

export type RouteErrorProps = Pick<ErrorPageContentProps, "error" | "reset">;

/**
 * Reusable error content for Next.js error.tsx pages.
 * Handles reporting and renders consistent error UI.
 */
export function ErrorPageContent({
  error,
  reset,
  title,
  description,
  logPrefix = "Page error",
  navigationLinks = [{ href: "/dashboard", label: "Dashboard" }],
  fullScreen = false,
}: ErrorPageContentProps) {
  const reported = useReportedError(error, { logPrefix });
  return (
    <ErrorPanel
      error={error}
      reported={reported}
      onRetry={reset}
      title={title}
      description={description}
      links={navigationLinks}
      fullScreen={fullScreen}
    />
  );
}
