"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function ActionsError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description="The actions page couldn't load. This may be a temporary issue."
      logPrefix="Actions page error"
      navigationLinks={[
        { href: "/actions", label: "Back to Actions" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
