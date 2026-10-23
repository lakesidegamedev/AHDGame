"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function CorporationsError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description="The corporations page couldn't load. This may be a temporary issue."
      logPrefix="Corporations page error"
      navigationLinks={[
        { href: "/corporations", label: "Back to Corporations" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
