"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function NewsError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description="The news page couldn't load. This may be a temporary issue."
      logPrefix="News page error"
      navigationLinks={[
        { href: "/news", label: "Back to News" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
