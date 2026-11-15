"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { NavPanelSkeleton } from "@/components/navbar/NavPanelSkeleton";
import { NavDropdownShell } from "@/components/navbar/NavDropdownShell";
import {
  isStaffUser,
  visibleStaffNavItems,
  type StaffNavOpts,
} from "@/components/navbar/staffNavItems";

const StaffDropdownPanel = dynamic(
  () => import("./StaffDropdownPanel").then((m) => m.StaffDropdownPanel),
  { ssr: false, loading: () => <NavPanelSkeleton rows={4} /> }
);

const preloadPanel = () => import("./StaffDropdownPanel");

type StaffDropdownProps = StaffNavOpts;

/**
 * Staff-only navigation menu. Replaces the old single admin "Ops" link with a
 * dropdown of staff tools. Each item is gated by role: admins see everything,
 * moderators see only what they can use (Mod Panel + Docs). Singleplayer
 * world owners also see Local World (/singleplayer/admin); singleplayer mode
 * alone never grants it. The trigger is hidden entirely for non-staff.
 */
export function StaffDropdown(props: StaffDropdownProps) {
  const t = useTranslations("nav");
  if (!isStaffUser(props)) return null;

  const visible = visibleStaffNavItems(props);
  if (visible.length === 0) return null;

  return (
    <NavDropdownShell
      label={t("common.staff")}
      panelWidthClass="w-52"
      onPreload={preloadPanel}
      renderPanel={(close) => <StaffDropdownPanel {...props} onClose={close} />}
    />
  );
}
