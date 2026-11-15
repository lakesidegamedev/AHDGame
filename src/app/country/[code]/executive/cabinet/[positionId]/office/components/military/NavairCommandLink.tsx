"use client";

import Link from "next/link";
import { SectionCard } from "../dossier";
import { navairUrl } from "@/lib/urls";

/**
 * The way into naval and air command from the defence office.
 *
 * Fleet orders live at `/country/<code>/navair`, which owns the whole force in
 * one screen. This is not a second command surface: one door, labelled with
 * what it is, on the tab the support copy names. The page still gates on the
 * seat server side.
 */
export function NavairCommandLink({ countryCode }: { countryCode: string }) {
  return (
    <SectionCard
      title="Naval and air command"
      sub="Stations and missions for the fleet and air force, including the Blockade posture"
    >
      <p className="text-[12px] text-muted">
        Hulls and wings are commanded from one screen, not from this roster. Where each formation is
        stationed and what it is doing — sea control, blockade of an enemy&apos;s trade approaches,
        close air support — is set at{" "}
        <Link
          href={navairUrl(countryCode)}
          className="font-semibold text-foreground underline decoration-dotted underline-offset-2 hover:text-gov-soft"
        >
          Naval and air command
        </Link>
        .
      </p>
    </SectionCard>
  );
}
