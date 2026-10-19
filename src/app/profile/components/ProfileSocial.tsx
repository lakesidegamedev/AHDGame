import Link from "next/link";
import { useTranslations } from "next-intl";
import { getOnlineStatus } from "@/lib/utils/onlineStatus";
import { DiscordBadge } from "../DiscordBadge";
import { SectionHeader } from "./ProfileMeters";

/** Discord link and last-seen status, shared by the own and public profile. */
export function ProfileSocial({
  discordId,
  discordUsername,
  discordAvatar,
  lastActivity,
  implementedSuggestions = 0,
}: {
  discordId: string | null;
  discordUsername: string | null;
  discordAvatar: string | null;
  lastActivity: Date | null;
  /** Player suggestions of theirs that shipped. */
  implementedSuggestions?: number;
}) {
  const t = useTranslations("profile.social");
  if (!discordId && !lastActivity && implementedSuggestions <= 0) return null;
  const online = lastActivity ? getOnlineStatus(lastActivity) : null;

  return (
    <section>
      <SectionHeader level="aside">{t("title")}</SectionHeader>
      <div className="flex flex-wrap items-center gap-3">
        {discordId && (
          <DiscordBadge
            discordId={discordId}
            discordUsername={discordUsername}
            discordAvatar={discordAvatar}
          />
        )}
        {implementedSuggestions > 0 && (
          <Link
            href="/feedback"
            className="inline-flex items-center gap-1.5 rounded-md bg-muted/20 px-2 py-0.5 text-body-sm text-foreground hover:bg-muted/30"
          >
            {t("implementedSuggestions", { count: implementedSuggestions })}
          </Link>
        )}
        {online && (
          <span className="inline-flex items-center gap-2 text-body-sm text-muted">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${online.isOnline ? "bg-foreground" : "bg-muted/60"}`}
            />
            {online.text}
          </span>
        )}
      </div>
    </section>
  );
}
