/** Subset of the bank console payload the corporation page uses to decide on the Bank tab. */
export interface BankTabProbe {
  visible?: boolean;
  charter?: unknown;
  canIssueCharter?: boolean;
}

/**
 * The Bank tab shows whenever the API says the console is visible (the
 * corporation owns a financial sector or holds an active charter). A charter
 * or the ability to issue one also shows it, so viewers who are not the CEO or
 * cannot yet afford a charter still reach the tab.
 */
export function shouldShowBankTab(json: BankTabProbe): boolean {
  return json.visible === true || !!json.charter || json.canIssueCharter === true;
}
