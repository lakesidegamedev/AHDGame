#!/usr/bin/env python3
"""PR governance for contributors (run by the required custom-rules check on pull requests).

For a PR opened by anyone other than the maintainer account or a bot:
1. The "Conflict of interest" section must be present with exactly one box ticked.
2. A change to economy or turn-processing code needs the maintainer's approving review
   on the PR's current commit. The check re-runs when a review is submitted.

Standard library only: the check runs inside the Semgrep container.
"""
import json
import os
import re
import sys
import urllib.request

MAINTAINERS = {"Egg3901"}
BOTS = {"dependabot[bot]", "github-actions[bot]"}
# Code that moves money, prices, production or turn results for every player.
ECONOMY = re.compile(
    r"^src/lib/(?:market|economy|economicModels|banking|bonds|equities|trade|tariffs|turn|budget|"
    r"publicFinance|governmentFinance|treasury|monetary\w*|moneySupply|centralBank|corporations|"
    r"commodities|extraction|labour|logistics|settlement|ledger|financialTxLog|forex|currency|"
    r"indexFunds|pensions|savings|subsidies|lineOfCredit|capital|governmentContracts|stockExchange|"
    r"sovereignDefault|nationalization|unions|wealth|products|macroMetrics|npps?|constants)(?:/|\.|$)"
    r"|^src/lib/turnSystem\.ts$"
)
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
    problems = []
    coi = coi_problem(pr.get("body"))
    if coi:
        problems.append(coi)
    files = [f["filename"] for f in paged(f"pulls/{pr['number']}/files")]
    economy = [f for f in files if ECONOMY.search(f)]
    if economy:
        head = pr["head"]["sha"]
        reviews = paged(f"pulls/{pr['number']}/reviews")
        approved = any(r["user"]["login"] in MAINTAINERS and r["state"] == "APPROVED" and r.get("commit_id") == head for r in reviews)
        if not approved:
            shown = ", ".join(economy[:5]) + (f" and {len(economy) - 5} more" if len(economy) > 5 else "")
            problems.append(f"This changes economy or turn code ({shown}). It needs an approving review from a maintainer on the current commit {head[:10]}.")
    if problems:
        for p in problems:
            print(f"::error::{p}")
        return 1
    print("Governance checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
