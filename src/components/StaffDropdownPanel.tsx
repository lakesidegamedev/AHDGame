"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { visibleStaffNavItems, type StaffNavOpts } from "@/components/navbar/staffNavItems";

export interface StaffDropdownPanelProps extends StaffNavOpts {
  onClose: () => void;
}

export function StaffDropdownPanel({
  isAdmin = false,
  isModerator = false,
  isSingleplayerOwner = false,
  onClose,
}: StaffDropdownPanelProps) {
  const t = useTranslations("nav");

  const visible = visibleStaffNavItems({ isAdmin, isModerator, isSingleplayerOwner });

  const itemClass =
    "flex items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-background/60";

  return (
    <div className="py-1">
      {visible.map((item) =>
        item.external ? (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onClose()}
            className={itemClass}
            role="menuitem"
          >
            {t(item.labelKey)}
          </a>
        ) : (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => onClose()}
            className={itemClass}
            role="menuitem"
          >
            {t(item.labelKey)}
          </Link>
        )
      )}
    </div>
  );
}
