"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { NavPanelSkeleton } from "@/components/navbar/NavPanelSkeleton";
import { NavDropdownShell } from "@/components/navbar/NavDropdownShell";
import { type WorldNavOpts } from "@/components/navbar/worldNavItems";

const WorldDropdownPanel = dynamic(
  () => import("./WorldDropdownPanel").then((m) => m.WorldDropdownPanel),
  { ssr: false, loading: () => <NavPanelSkeleton rows={8} /> }
);

const preloadPanel = () => import("./WorldDropdownPanel");

interface WorldDropdownProps extends WorldNavOpts {
  isUKContext?: boolean;
}

export function WorldDropdown(props: WorldDropdownProps) {
  const t = useTranslations("nav");
  return (
    <NavDropdownShell
      label={t("common.world")}
      panelWidthClass="w-56"
      onPreload={preloadPanel}
      panelRole="menu"
      renderPanel={(close) => <WorldDropdownPanel {...props} onClose={close} />}
    />
  );
}
