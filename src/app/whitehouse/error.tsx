"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function WhitehouseError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description="The White House page couldn't load. This may be a temporary issue."
      logPrefix="White House page error"
      navigationLinks={[
        { href: "/whitehouse", label: "Back to White House" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
