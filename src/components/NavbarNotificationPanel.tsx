"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { isActionRequiredType } from "@/lib/inbox/priority";
import type { NotificationType } from "@/lib/db/types/notifications";
import { NOTIFICATION_LIST_CLASS } from "@/components/navbar/dropdownStyles";
import type { NotificationPreview } from "@/components/navbar/useNavbarState";

interface NavbarNotificationPanelProps {
  previews: NotificationPreview[];
  onMarkRead: (id: string, event: React.MouseEvent) => void;
  onDelete: (id: string, event: React.MouseEvent) => void;
  onClose: () => void;
}

/**
 * Bell preview panel. Split from Navbar so the list markup and its row actions
 * only load when the bell is first opened, not on first paint.
 */
export function NavbarNotificationPanel({
  previews,
  onMarkRead,
  onDelete,
  onClose,
}: NavbarNotificationPanelProps) {
  const t = useTranslations("nav");
  const hasActionRequired = previews.some(
    (n) => !n.read && isActionRequiredType(n.type as NotificationType)
  );

  return (
    <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-card-border bg-card shadow-modal overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-card-border">
        <span className="text-sm font-semibold">{t("common.notifications")}</span>
        <Link
          href="/notifications"
          onClick={onClose}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {t("notifications.openInbox")}
        </Link>
      </div>
      {hasActionRequired && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-card-border">
          <span className="ahd-bell-pulse h-2 w-2 shrink-0 rounded-full bg-primary" />
          <span className="text-xs text-fg-2">
            {t("notifications.awaitingInput", {
              count: previews.filter(
                (n) => !n.read && isActionRequiredType(n.type as NotificationType)
              ).length,
            })}
          </span>
        </div>
      )}
      <div className={`py-1 ${NOTIFICATION_LIST_CLASS}`}>
        {previews.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">{t("notifications.empty")}</p>
        ) : (
          [...previews]
            .sort(
              (a, b) =>
                Number(!b.read && isActionRequiredType(b.type as NotificationType)) -
                Number(!a.read && isActionRequiredType(a.type as NotificationType))
            )
            .map((n) => (
              <div
                key={n._id}
                className={`group flex items-start gap-2 px-4 py-3 text-sm transition-colors hover:bg-card-elevated ${n.read ? "opacity-60" : ""}`}
              >
                {!n.read && (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                )}
                <Link href="/notifications" onClick={onClose} className="flex-1 min-w-0">
                  {!n.read && isActionRequiredType(n.type as NotificationType) && (
                    <span className="mb-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary bg-primary/10">
                      {t("notifications.needsYou")}
                    </span>
                  )}
                  <p
                    className={`font-medium truncate ${n.read ? "text-muted" : "text-foreground"}`}
                  >
                    {n.title}
                  </p>
                  <p className="text-xs text-muted line-clamp-1 mt-0.5">{n.message}</p>
                </Link>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!n.read && (
                    <button
                      onClick={(e) => onMarkRead(n._id, e)}
                      className="p-1 rounded text-muted hover:text-foreground hover:bg-card-muted transition-colors"
                      title={t("notifications.markRead")}
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => onDelete(n._id, e)}
                    className="p-1 rounded text-muted hover:text-error hover:bg-card-muted transition-colors"
                    title={t("notifications.delete")}
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
