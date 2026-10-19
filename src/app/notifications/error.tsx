"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function NotificationsError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load notifications"
      description="Your notifications failed to load. This may be a temporary issue."
      logPrefix="Notifications page error"
      navigationLinks={[{ href: "/dashboard", label: "Dashboard" }]}
      fullScreen
    />
  );
}
