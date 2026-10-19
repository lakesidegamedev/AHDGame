"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function BillError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description="The bill page couldn't load. This may be a temporary issue."
      logPrefix="Bill page error"
      navigationLinks={[
        { href: "/congress?chamber=senate&tab=bills", label: "Back to Senate bills" },
        { href: "/dashboard", label: "Dashboard" },
      ]}
      fullScreen
    />
  );
}
