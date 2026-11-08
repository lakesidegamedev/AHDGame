"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { NavPanelSkeleton } from "@/components/navbar/NavPanelSkeleton";
import { NavDropdownShell } from "@/components/navbar/NavDropdownShell";
export {
  HELP_DISCORD_URL,
  HELP_PATREON_URL,
  HELP_SUPPORTER_WALL_URL,
  HELP_SUPPORT_EMAIL,
  HELP_STATUS_URL,
} from "@/components/navbar/helpLinks";

const HelpDropdownPanel = dynamic(
  () => import("./HelpDropdownPanel").then((m) => m.HelpDropdownPanel),
  { ssr: false, loading: () => <NavPanelSkeleton rows={9} /> }
);

const preloadPanel = () => import("./HelpDropdownPanel");

interface HelpDropdownProps {
  onOpenFeedback?: () => void;
  feedbackCapturing?: boolean;
  wikiDisabled?: boolean;
  isAdminOrMod?: boolean;
}

export function HelpDropdown(props: HelpDropdownProps) {
  const t = useTranslations("nav");
  return (
    <NavDropdownShell
      label={t("common.help")}
      panelWidthClass="w-52"
      onPreload={preloadPanel}
      renderPanel={(close) => <HelpDropdownPanel {...props} onClose={close} />}
    />
  );
}
