"use client";

import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function ProfileError({ error, reset }: RouteErrorProps) {
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      title="Couldn't load profile"
      description="Your profile failed to load. This may be a temporary issue."
      logPrefix="Profile page error"
      navigationLinks={[{ href: "/dashboard", label: "Dashboard" }]}
    />
  );
}
