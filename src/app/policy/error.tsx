"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function PolicyError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description="The policy page couldn't load. This may be a temporary issue."
      logPrefix="Policy page error"
      navigationLinks={[
        { href: "/policy", label: "Back to Policy" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
