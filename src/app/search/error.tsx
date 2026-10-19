"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function SearchError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load search"
      description="Search failed to load. This may be a temporary issue."
      logPrefix="Search page error"
      navigationLinks={[{ href: "/dashboard", label: "Dashboard" }]}
    />
  );
}
