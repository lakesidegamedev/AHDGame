import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every tab bar, segmented control and filter pill marks its selected option
 * with the same filled primary pill (selectedState.ts). This scans every
 * element that carries a selection attribute and flags underline tabs and any
 * selected branch that is not the filled primary.
 *
 * Choice cards, list rows and map tiles also carry selection attributes but
 * are not tabs or pills; they are listed in EXEMPT with the reason.
 */

const SRC = join(process.cwd(), "src");
const SELECTION_ATTRIBUTE =
  /\b(aria-selected|aria-current|aria-pressed|aria-checked)=|role=["'](tab|radio)["']/;

/** path relative to src, then why it is not a tab, segmented control or pill. */
export const EXEMPT: Record<string, string> = {
  "app/corporation/[id]/bank/sections/LoanBookTable.tsx": "profile choice link inside a table cell",
  "app/corporation/[id]/sector/[sectorId]/sections/InventoryPanel.tsx": "single on/off toggle",
  "app/country/[code]/executive/cabinet/[positionId]/office/components/CabinetPositionRail.tsx":
    "selectable list rail of cabinet positions",
  "app/country/[code]/executive/cabinet/[positionId]/office/components/military/commands/CommandRoster.tsx":
    "selectable list cards",
  "app/country/[code]/executive/cabinet/[positionId]/office/components/military/commands/CommandsBuilder.tsx":
    "single on/off toggle",
  "app/country/[code]/executive/supreme-court/components/ScotusNominateModal.tsx":
    "choice cards in the nomination dialog",
  "app/country/[code]/politicians/PoliticiansClient.tsx": "single on/off toggle",
  "app/country/[code]/stockmarket/components/BondTable.tsx": "single on/off toggle",
  "app/country/[code]/stockmarket/components/ExchangeSelector.tsx":
    "option rows in a dropdown list",
  "app/create-character/ConversationShell.tsx": "progress stepper, not a control",
  "app/create-character/CreateCharacterClient.view.tsx": "choice cards in the character form",
  "app/create-character/HomeStatePicker.tsx": "selectable list rows in the character form",
  "app/create-character/PartyPicker.tsx": "choice cards in the character form",
  "app/create-character/creatorPrimitives.tsx": "choice cards in the character form",
  "app/elections/[id]/components/PrimaryPhaseView.tsx": "selectable list cards",
  "app/notifications/inbox/InboxClient.tsx": "notifications: owned by another fixer",
  "app/notifications/inbox/RailItem.tsx": "notifications: owned by another fixer",
  "app/portfolio/components/WireTransferCard.tsx": "currency choice cards in a form",
  "app/settings/components/AppearanceSection.tsx": "layout choice cards",
  "app/settings/components/LanguageSection.tsx": "language choice cards",
  "app/whitehouse/cabinet/components/CabinetNominateModal.tsx":
    "choice cards in the nomination dialog",
  "app/world/international-organizations/components/CreateOrgForm.tsx": "colour swatch choice",
  "app/world/rankings/WorldRankingsClient.tsx": "per-row compare toggle in a table",
  "components/ExperimentalNavbar.view.tsx": "site navigation links",
  "components/Navbar.tsx": "site navigation links",
  "components/UniversalSearch.tsx": "option rows in the search results list",
  "components/admin/alts/ClusterList.tsx": "admin on/off filter toggle",
  "components/admin/countries/CountryOverviewCard.tsx": "on/off switch",
  "components/admin/dashboard/KillSwitchBoard.tsx": "on/off switch cards",
  "components/admin/forensics/AuditFilters.tsx": "admin on/off filter toggle",
  "components/admin/players/UsersToolbar.tsx": "on/off filter toggle",
  "components/admin/wiki/WikiManagementTab.tsx": "on/off switch",
  "components/askDrawer/AskDrawerPanel.tsx": "icon toggles, not tabs or pills",
  "components/character/WealthTierRepickGate.tsx": "choice cards in a dialog",
  "components/corporation/ExpandMarketModal.view.tsx": "selectable list rows in a dialog",
  "components/corporation/groups/GroupSupplyChain.tsx": "policy choice cards",
  "components/corporation/shares/HoldingTermSelector.tsx": "choice cards in a trade form",
  "components/crises/CrisisV2Strip.tsx": "stage progress track, not a control",
  "components/national/tabs/NatMandatesTab.tsx": "on/off switch",
  "components/navbar/CampaignDropdown.tsx": "site navigation menu",
  "components/navbar/DesktopMegaMenu.tsx": "site navigation menu pin toggle",
  "components/navbar/ExperimentalMobileMenu.tsx": "site navigation menu",
  "components/navbar/MobileNationalDetails.tsx": "site navigation menu",
  "components/navbar/MobileWorldLinks.tsx": "site navigation menu",
  "components/navbar/NavCustomizeDialog.tsx": "navigation customise dialog",
  "components/navbar/NavbarMobileMenu.tsx": "site navigation menu",
  "components/navbar/mobileDockModel.tsx": "site navigation menu",
  "components/state/economy/SectorBoard.tsx": "selectable sector tiles",
  "components/tutorial/TutorialCoach.tsx": "chapter progress dots, not tabs",
  "components/tutorial/TutorialWelcome.tsx": "choice cards in the welcome dialog",
  "components/wiki/layout/Breadcrumbs.tsx": "breadcrumb trail, not a control",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
  });
}

function tagEnd(source: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === quote && source[i - 1] !== "\\") quote = null;
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return i;
  }
  return source.length;
}

export function offendingSelectionControls(): string[] {
  const offenders: string[] = [];
  for (const file of files(SRC)) {
    const path = relative(SRC, file);
    if (EXEMPT[path]) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<(button|a|Link|span|div|li|label)\b/g)) {
      const tag = source.slice(match.index, tagEnd(source, match.index + match[0].length));
      if (!SELECTION_ATTRIBUTE.test(tag) || /pillClass\(|PILL_SELECTED/.test(tag)) continue;
      const selectedBranches = [...tag.matchAll(/\?\s*(["'`])([^"'`]*)\1/g)]
        .map((branch) => branch[2])
        .filter((branch) => /\b(bg|text|border)-/.test(branch));
      const underline =
        /border-b-2/.test(tag) && /border-(primary|foreground|white|transparent)/.test(tag);
      const notFilled = selectedBranches.some((branch) => !/(^|\s)bg-primary(\s|$)/.test(branch));
      if (underline || notFilled) {
        offenders.push(`${path}:${source.slice(0, match.index).split("\n").length}`);
      }
    }
  }
  return offenders;
}

/**
 * Choice cards and row pickers that use a light primary tint for the chosen
 * option. They are not tabs, segmented controls or filter pills.
 */
const TINT_EXEMPT: Record<string, string> = {
  "app/country/[code]/executive/supreme-court/components/ScotusNominateModal.tsx":
    "nominee choice cards",
  "app/country/[code]/parties/[id]/components/CreateProposalForm.tsx": "proposal choice cards",
  "app/country/[code]/parties/[id]/components/PriorityRegionCard.tsx": "region choice cards",
  "app/country/[code]/region/[id]/office/tabs/orders/IssueOrderModal.tsx": "order choice cards",
  "app/whitehouse/cabinet/components/CabinetNominateModal.tsx": "nominee choice cards",
  "app/elections/[id]/components/RunningMateSelector.tsx": "running mate choice cards",
  "components/corporation/ExpandMarketModal.view.tsx": "market choice cards",
  "components/SubscribeButton.tsx": "single subscribe toggle",
  "components/admin/system/SetupPanel.tsx": "setup choice cards",
  "components/influence/NppRosterPanel.tsx": "roster row selection",
  "components/influence/NppSlotTierTable.tsx": "table row selection",
  "app/notifications/inbox/InboxClient.tsx": "notifications: owned by another fixer",
  "app/create-imperial-character/page.tsx": "character choice cards",
  "app/feedback/page.tsx": "feedback category choice cards",
  "app/country/[code]/parties/[id]/components/caucus/SelectedCaucus.tsx": "caucus member selection",
  "app/world/components/CountryComparePanel.tsx": "country choice list",
  "components/economy/EconomicModelCard.tsx": "model choice cards",
  "components/GameResetControls.tsx": "admin reset option cards",
};

/** Tab-like toggles that carry no selection attribute still must not use a tint or underline. */
export function offendingUnmarkedToggles(): string[] {
  const offenders: string[] = [];
  const tinted =
    /\?\s*(["'`])[^"'`]*\bbg-primary\/[\d[\].]+[^"'`]*\btext-primary\b[^"'`]*\1\s*:\s*(["'`])[^"'`]*\btext-muted\b/;
  for (const file of files(SRC)) {
    const path = relative(SRC, file);
    if (EXEMPT[path] || TINT_EXEMPT[path]) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<(button|a|Link|span|div|li)\b/g)) {
      const tag = source.slice(match.index, tagEnd(source, match.index + match[0].length));
      if (/pillClass\(|PILL_SELECTED/.test(tag)) continue;
      const underline =
        /border-b-2/.test(tag) && /\?\s*["'`][^"'`]*border-(primary|foreground|white)/.test(tag);
      if (underline || tinted.test(tag)) {
        offenders.push(`${path}:${source.slice(0, match.index).split("\n").length}`);
      }
    }
  }
  return offenders;
}

describe("selected state", () => {
  it("uses the filled primary pill for every tab, segmented control and filter pill", () => {
    expect(offendingSelectionControls()).toEqual([]);
  }, 60_000);

  it("keeps unmarked tab-like toggles off tints and underlines", () => {
    expect(offendingUnmarkedToggles()).toEqual([]);
  }, 60_000);
});
