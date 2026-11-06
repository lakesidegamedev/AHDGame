#!/usr/bin/env python3
"""PR governance for contributors (run by the required custom-rules check on pull requests).

For a PR opened by anyone other than a maintainer account or a bot:
1. The "Conflict of interest" section must be present with exactly one box ticked.
2. A change to economy or turn-processing code needs the maintainer's approving review
   on the PR's current commit. The check re-runs when a review is submitted.

Exemptions and alternatives:
- Promote PRs (development -> staging, staging -> main) opened from a branch in this same
  repository are exempt: their content passed these checks when it entered development.
  A PR from a fork never qualifies.
- A maintainer can approve in a PR comment instead of a review: `/approve <sha>` where
  <sha> is the full head commit or a prefix of at least 7 characters (text may follow).
  It counts exactly like an approving review, but only for the commit it names, so a push
  after the comment needs a fresh one. Agents post it only after the maintainer has
  approved in chat or through the operator bot. Comments by anyone else never count,
  except the operator bot relaying a maintainer, and nobody can approve their own PR this way.
  The `approve-comment-rerun` workflow re-runs the checks when such a comment is posted.

Standard library only: the check runs inside the Semgrep container.
"""
import json
import os
import re
import sys
import urllib.request

MAINTAINERS = {"Egg3901", "arle-bina"}
BOTS = {"dependabot[bot]", "github-actions[bot]"}
# Operator bots follow every rule that applies to contributors. The only difference is that
# their `/approve <sha>` comment relaying a maintainer's approval is honoured.
OPERATOR_BOTS = {"keir-bot"}
PROMOTE_PAIRS = {("development", "staging"), ("staging", "main")}
APPROVE_COMMENT = re.compile(r"\A\s*/approve\s+([0-9a-fA-F]{7,40})(?![0-9a-zA-Z])")
# Code that moves money, prices, production or turn results for every player.
ECONOMY = re.compile(
    r"^src/lib/(?:market|economy|economicModels|banking|bonds|equities|trade|tariffs|turn|budget|"
    r"publicFinance|governmentFinance|treasury|monetary\w*|moneySupply|centralBank|corporations|"
    r"commodities|extraction|labour|logistics|settlement|ledger|financialTxLog|forex|currency|"
    r"indexFunds|pensions|savings|subsidies|lineOfCredit|capital|governmentContracts|stockExchange|"
    r"sovereignDefault|nationalization|unions|wealth|products|macroMetrics|npps?|constants)(?:/|\.|$)"
    r"|^src/lib/turnSystem\.ts$"
)
# The rules themselves: CI workflows, code owners and these scripts. Without this a
# contributor could rewrite the check in the same PR it is checking.
GOVERNANCE = re.compile(r"^\.github/|^scripts/ci/")
BOX = re.compile(r"^\s*-\s*\[([ xX])\]\s*(.+)$", re.M)


def api(path):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/{path}",
        headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}", "Accept": "application/vnd.github+json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def paged(path):
    out, page = [], 1
    while True:
        rows = api(f"{path}{'&' if '?' in path else '?'}per_page=100&page={page}")
        out += rows
        if len(rows) < 100:
            return out
        page += 1


def coi_problem(body):
    m = re.search(r"^##\s*Conflict of interest\s*$(.*?)(?=^##\s|\Z)", body or "", re.M | re.S | re.I)
    if not m:
        return "The PR description is missing its \"Conflict of interest\" section. Restore it from the template and tick one box."
    ticked = [text for mark, text in BOX.findall(m.group(1)) if mark.lower() == "x"]
    if len(ticked) != 1:
        return f"Tick exactly one box under \"Conflict of interest\" ({len(ticked)} ticked)."
    return None


def is_promote(pr):
    head, base = pr.get("head") or {}, pr.get("base") or {}
    head_repo = (head.get("repo") or {}).get("full_name")
    base_repo = (base.get("repo") or {}).get("full_name")
    return bool(head_repo) and head_repo == base_repo and (head.get("ref"), base.get("ref")) in PROMOTE_PAIRS


def approved_by_review(reviews, head):
    return any(r["user"]["login"] in MAINTAINERS and r["state"] == "APPROVED" and r.get("commit_id") == head for r in reviews)


def approved_by_comment(comments, head, author):
    head = head.lower()
    for c in comments:
        who = (c.get("user") or {}).get("login")
        if who not in MAINTAINERS and who not in OPERATOR_BOTS:
            continue
        if who == author:
            continue
        m = APPROVE_COMMENT.match(c.get("body") or "")
        if m and head.startswith(m.group(1).lower()):
            return True
    return False


def evaluate(pr, files, fetch_approvals, guard_only=False):
    """Return the list of problems for a non-maintainer PR. fetch_approvals() -> (reviews, comments)."""
    if is_promote(pr):
        return []
    problems = []
    coi = None if guard_only else coi_problem(pr.get("body"))
    if coi:
        problems.append(coi)
    economy = [] if guard_only else [f for f in files if ECONOMY.search(f)]
    rules = [f for f in files if GOVERNANCE.search(f)]
    if economy or rules:
        head = pr["head"]["sha"]
        reviews, comments = fetch_approvals()
        approved = approved_by_review(reviews, head) or approved_by_comment(comments, head, pr["user"]["login"])
        if not approved and rules:
            rerun = " After approving, re-run this check." if guard_only else ""
            problems.append(f"This changes CI or governance files ({', '.join(rules[:5])}). It needs an approving review from a maintainer on the current commit {head[:10]}, or a maintainer comment `/approve {head[:10]}`.{rerun}")
        if not approved and economy:
            shown = ", ".join(economy[:5]) + (f" and {len(economy) - 5} more" if len(economy) > 5 else "")
            problems.append(f"This changes economy or turn code ({shown}). It needs an approving review from a maintainer on the current commit {head[:10]}, or a maintainer comment `/approve {head[:10]}`.")
    return problems


def main():
    event = json.load(open(os.environ["GITHUB_EVENT_PATH"]))
    pr = event.get("pull_request")
    if not pr:
        print("Not a pull request event; nothing to check.")
        return 0
    author = pr["user"]["login"]
    if author in MAINTAINERS or author in BOTS:
        print(f"PR by {author}: governance checks do not apply.")
        return 0
    # Re-read the PR so a review event sees the current description and head.
    pr = api(f"pulls/{pr['number']}")
    if is_promote(pr):
        print("Promote PR from this repository: governance checks do not apply.")
        return 0
    # The guard workflow runs on pull_request_target, so it uses the base branch's copy of
    # this script and workflow; it checks only the rule files and leaves the rest to custom-rules.
    guard_only = os.environ.get("GOVERNANCE_GUARD_ONLY") == "1"
    files = [f["filename"] for f in paged(f"pulls/{pr['number']}/files")]
    n = pr["number"]
    problems = evaluate(pr, files, lambda: (paged(f"pulls/{n}/reviews"), paged(f"issues/{n}/comments")), guard_only)
    if problems:
        for p in problems:
            print(f"::error::{p}")
        return 1
    print("Governance checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
