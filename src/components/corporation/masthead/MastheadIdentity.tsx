import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { STATE_FLAGS } from "@/lib/constants";
import { bypassNextImageOptimization } from "@/lib/images/bypassImageOptimization";
import { regionUrl } from "@/lib/urls";
import { corporationWikiSlug } from "@/lib/wiki/playerPages";
import type { CEO, CorporationDetail } from "../CorporationPageTypes";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-r border-card-border py-2.5 pr-5 last:border-r-0 last:pr-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span className="flex min-h-6 min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
        {children}
      </span>
    </div>
  );
}

/**
 * The masthead's identity column: listing line, logo and name, the facts row
 * and the viewer's actions.
 */
export function MastheadIdentity({
  corporation,
  ceo,
  isCeo,
  exchangeLabel,
  ticker,
  typeLabel,
  onOpenSettings,
  wikiAction,
  actions,
}: {
  corporation: CorporationDetail;
  ceo: CEO | null;
  isCeo: boolean;
  exchangeLabel: string;
  ticker: string;
  typeLabel: string;
  onOpenSettings: () => void;
  /** The CEO's "Create wiki page" control when no page is published yet. */
  wikiAction?: ReactNode;
  actions: ReactNode;
}) {
  const hqFlag = STATE_FLAGS[corporation.headquartersState];
  const wikiPublished =
    typeof corporation.sequentialId === "number" && corporation.wikiPagePublished === true;

  return (
    <div className="flex min-w-0 flex-col justify-between gap-4">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        <span className="rounded-[3px] border border-primary px-2 py-1 text-foreground">
          {exchangeLabel}: {ticker}
        </span>
        {isCeo ? (
          // The CEO changes the sector type in Settings; the label is the
          // place players look for it (ticket 1456).
          <button
            type="button"
            onClick={onOpenSettings}
            title="Change sector type in corporation settings"
            className="min-h-7 uppercase underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            {typeLabel}
          </button>
        ) : (
          <span>{typeLabel}</span>
        )}
        {corporation.legalStructureLabel && <span>{corporation.legalStructureLabel}</span>}
        <span
          className={corporation.isPrivate ? "" : "inline-flex items-center gap-1.5 text-success"}
        >
          {!corporation.isPrivate && (
            <i aria-hidden className="inline-block h-[7px] w-[7px] rounded-full bg-success" />
          )}
          {corporation.isPrivate ? "Private" : "Public"}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-4">
        {corporation.logoUrl ? (
          <Image
            src={corporation.logoUrl}
            alt=""
            width={64}
            height={64}
            className="h-12 w-12 shrink-0 rounded-[calc(var(--corp-rad,6px)+2px)] border border-card-border object-cover lg:h-16 lg:w-16"
            sizes="64px"
            unoptimized={bypassNextImageOptimization(corporation.logoUrl)}
          />
        ) : (
          <span
            aria-hidden
            data-logo-tile
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[calc(var(--corp-rad,6px)+2px)] bg-primary text-sm font-bold text-background lg:h-16 lg:w-16 lg:text-lg"
          >
            {ticker.slice(0, 4)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold leading-tight tracking-tight text-foreground lg:text-[44px]">
            {corporation.name}
          </h1>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 border-y border-card-border">
        {corporation.countryId && corporation.headquartersState && (
          <Fact label="Headquarters">
            <Link
              href={regionUrl(corporation.countryId, corporation.headquartersState)}
              className="inline-flex min-w-0 items-center gap-2 hover:underline"
            >
              {hqFlag && (
                <Image
                  src={hqFlag}
                  alt=""
                  width={20}
                  height={13}
                  className="h-[13px] w-5 rounded-[2px] object-cover"
                  unoptimized={bypassNextImageOptimization(hqFlag)}
                />
              )}
              <span className="truncate">{corporation.headquartersStateName}</span>
            </Link>
          </Fact>
        )}
        <Fact label="Chief executive">
          {corporation.ceoVacant || !ceo ? (
            <span className="text-warning">CEO vacant</span>
          ) : (
            <Link
              href={ceo.profilePath ?? `/character/${ceo.sequentialId}`}
              className="inline-flex min-w-0 items-center gap-2 hover:underline"
            >
              <Avatar
                url={ceo.avatarUrl}
                name={ceo.name}
                size="h-5 w-5"
                className="rounded-[3px]"
                borderKey={ceo.borderKey}
                tintColor={ceo.tintColor}
              />
              <span className="truncate">{ceo.name}</span>
            </Link>
          )}
        </Fact>
        {corporation.parentCorporation && (
          <Fact label={corporation.isFormalizedSubsidiary ? "Subsidiary of" : "Majority owner"}>
            <Link
              href={`/corporation/${corporation.parentCorporation.sequentialId ?? corporation.parentCorporation._id}`}
              className="truncate hover:underline"
            >
              {corporation.parentCorporation.name}
            </Link>
            <span className="font-mono text-xs font-medium tabular-nums text-muted">
              {corporation.parentCorporation.ownershipPct.toFixed(1)}%
            </span>
          </Fact>
        )}
        {wikiPublished && (
          <Fact label="Wiki">
            <Link
              href={`/wiki/${corporationWikiSlug(corporation.sequentialId as number)}`}
              className="hover:underline"
            >
              Wiki
            </Link>
          </Fact>
        )}
        {!wikiPublished && wikiAction && <Fact label="Wiki">{wikiAction}</Fact>}
      </div>

      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
