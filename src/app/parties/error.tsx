"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function PartiesError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description="The parties page couldn't load. This may be a temporary issue."
      logPrefix="Parties page error"
      navigationLinks={[
        { href: "/parties", label: "Back to Parties" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
