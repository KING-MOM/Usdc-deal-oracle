# GitHub PR-based Deals (v1)

This repo supports a **GitHub-native** deal flow:

- **Deal** = a GitHub Issue with a ```deal fenced block
- **Submission** = a **merged PR** that references the Issue and includes `payout_address: 0x...` in its PR body
- **Evaluation** produces `evaluation.json` + `scoreboard.md`
- **Release** happens only after the challenge window ends and is designed to be idempotent

## How to run (local)

1) Ingest a deal issue + merged PR submissions into a run directory:

```bash
export GITHUB_TOKEN=...   # recommended
node skills/usdc-deal-oracle/scripts/github-ingest.mjs ingest \
  --repo KING-MOM/Usdc-deal-oracle \
  --issue <ISSUE_NUMBER> \
  --out runs/deal-issue-<ISSUE_NUMBER>
```

2) Evaluate without Circle installed:

```bash
node skills/usdc-deal-oracle/scripts/deal-runner.mjs evaluate \
  --run runs/deal-issue-<ISSUE_NUMBER>
```

3) (Later) Release after the challenge window:

```bash
# Requires Circle env vars + deps
node skills/usdc-deal-oracle/scripts/deal-runner.mjs release \
  --run runs/deal-issue-<ISSUE_NUMBER>
```

## Required PR fields

Include in PR body:

```
payout_address: 0xYourEvmAddress
proof_links: https://... (optional)
```
