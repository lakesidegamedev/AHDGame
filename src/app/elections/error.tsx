"use client";

import { useTranslations } from "next-intl";
import { ErrorPageContent, type RouteErrorProps } from "@/components/ui";

export default function ElectionsError({ error, reset }: RouteErrorProps) {
  const t = useTranslations("elections");
  return (
    <ErrorPageContent
      error={error}
      reset={reset}
      description={t("error.description")}
      logPrefix="Elections page error"
      navigationLinks={[
        { href: "/elections", label: t("error.backToElections") },
        { href: "/dashboard", label: t("error.dashboard") },
      ]}
      fullScreen
    />
  );
}
