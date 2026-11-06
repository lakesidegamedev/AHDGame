import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import pr_governance as g  # noqa: E402

HEAD = "abcdef1234567890abcdef1234567890abcdef12"
BODY = "## Conflict of interest\n- [x] None\n- [ ] Other\n"


def pr(head_ref="feature", base_ref="development", fork=False, author="someone"):
    return {
        "user": {"login": author},
        "body": BODY,
        "head": {"sha": HEAD, "ref": head_ref, "repo": {"full_name": "fork/repo" if fork else "org/repo"}},
        "base": {"ref": base_ref, "repo": {"full_name": "org/repo"}},
    }


def comment(who, body):
    return {"user": {"login": who}, "body": body}


ECON = ["src/lib/market/prices.ts"]


def run(p, files=ECON, reviews=(), comments=(), guard_only=False):
    return g.evaluate(p, files, lambda: (list(reviews), list(comments)), guard_only)


class GovernanceTests(unittest.TestCase):
    def test_economy_without_approval_fails(self):
        self.assertEqual(len(run(pr())), 1)

    def test_promote_exempt_even_without_coi(self):
        for head, base in (("development", "staging"), ("staging", "main")):
            p = pr(head, base)
            p["body"] = ""
            self.assertEqual(run(p, ECON + [".github/x.yml"]), [])

    def test_fork_promote_not_exempt(self):
        self.assertTrue(run(pr("development", "staging", fork=True)))

    def test_wrong_direction_not_exempt(self):
        self.assertTrue(run(pr("development", "main")))

    def test_approve_comment_full_and_prefix(self):
        for sha in (HEAD, HEAD[:7], HEAD[:7].upper()):
            self.assertEqual(run(pr(), comments=[comment("Egg3901", f"/approve {sha} owner ok")]), [])

    def test_stale_sha_does_not_count(self):
        self.assertTrue(run(pr(), comments=[comment("Egg3901", "/approve 1234567")]))

    def test_short_prefix_does_not_count(self):
        self.assertTrue(run(pr(), comments=[comment("Egg3901", f"/approve {HEAD[:6]}")]))

    def test_non_maintainer_comment_ignored(self):
        self.assertTrue(run(pr(), comments=[comment("randomuser", f"/approve {HEAD}")]))

    def test_must_start_comment(self):
        self.assertTrue(run(pr(), comments=[comment("Egg3901", f"please do not /approve {HEAD}")]))

    def test_operator_bot_comment_counts_but_not_self_approval(self):
        c = [comment("keir-bot", f"/approve {HEAD}")]
        self.assertEqual(run(pr(author="someone"), comments=c), [])
        self.assertTrue(run(pr(author="keir-bot"), comments=c))

    def test_operator_bot_pr_still_needs_coi(self):
        p = pr(author="keir-bot")
        p["body"] = ""
        self.assertTrue(run(p, files=["src/app/x.ts"]))

    def test_review_path_unchanged(self):
        ok = {"user": {"login": "Egg3901"}, "state": "APPROVED", "commit_id": HEAD}
        old = dict(ok, commit_id="0" * 40)
        self.assertEqual(run(pr(), reviews=[ok]), [])
        self.assertTrue(run(pr(), reviews=[old]))
        self.assertTrue(run(pr(), reviews=[dict(ok, user={"login": "randomuser"})]))

    def test_rules_files_need_approval_and_guard_only_skips_economy(self):
        self.assertTrue(run(pr(), files=[".github/workflows/a.yml"]))
        self.assertEqual(run(pr(), guard_only=True), [])
        self.assertEqual(run(pr(), files=[".github/a.yml"], comments=[comment("Egg3901", f"/approve {HEAD}")]), [])


if __name__ == "__main__":
    unittest.main()
