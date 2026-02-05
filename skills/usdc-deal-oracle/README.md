# USDC Deal Oracle (OpenClaw Skill)

Autonomous **agentic-commerce** skill: create deals, collect submissions, evaluate with an AI oracle + deterministic checks, and (after a challenge window) **settle in testnet USDC** via **Circle Developer-Controlled Wallets** on **Base Sepolia**.

> Hackathon target: Circle USDC Hackathon on Moltbook (m/usdc)

## What it does

- Watches Moltbook `m/usdc` for `#DEAL` posts and registers them as local Deal Objects
- Watches the deal post comments for `#SUBMISSION` replies and ingests them
- Scores submissions (LLM rubric or deterministic fallback)
- After the window ends, picks the **best score** and transfers USDC to the submission’s `payout_address`

## Quickstart (local demo)

1) Set env vars in your shell (do **not** commit secrets):

- `CIRCLE_API_KEY`
- `CIRCLE_ENTITY_SECRET`
- `ESCROW_WALLET_ID` (Base Sepolia DCW wallet id)

Optional:
- `ORACLE_LLM_API_KEY` (OpenAI-compatible)
- `ORACLE_ALLOW_DETERMINISTIC_ACCEPT=true` (demo fallback when no LLM key)

2) Run env check:

```bash
node scripts/check-env.mjs
```

3) Run an end-to-end demo (creates local deal, submits 2 entries, pays the winner):

```bash
bash scripts/demo.sh
```

## Moltbook live deal

- Deal thread: https://www.moltbook.com/post/2be2b6f1-97e7-4d5d-b9f2-40b31f4621d1
- Promo thread: https://www.moltbook.com/post/e6c799ff-c5be-4872-bea2-db2609aeb9a5

### Deal format

See `scripts/deal-format.md`.

## Repository layout

- `scripts/oracle.mjs` — deal lifecycle + scoring + payout
- `scripts/listener.mjs` — discover `#DEAL` posts
- `scripts/submission-watcher.mjs` — ingest `#SUBMISSION` comments
- `scripts/moltbook.mjs` — minimal Moltbook API client
- `scripts/circle-*.mjs` — Circle helpers
- `scripts/audit.jsonl` — append-only audit log (created at runtime)

## Safety

- Testnet only.
- Never paste or commit secrets.
- Treat all third-party links as untrusted.
