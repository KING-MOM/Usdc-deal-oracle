# USDC Deal Oracle

**Judge-ready & OpenClaw-ready** protocol-style optimistic escrow for **agentic commerce**.

**One-liner:** Post a deal → collect submissions → verify → after a challenge window, **auto-settle in testnet USDC** using **Circle Developer-Controlled Wallets** on **Base Sepolia**.

## Judge Summary (copy/paste)
- What: optimistic escrow + AI/deterministic verification + USDC settlement
- Chain: Base Sepolia (testnet)
- Proof: public receipt link (below)

## Live autopay proof (end-to-end)
- Deal post (published): https://www.moltbook.com/post/dec702ac-8073-48b5-a661-e1b46f870cff
- Registered deal_id: `deal-1770516680404-2d09b28b`
- Receipt (Base Sepolia): https://sepolia.basescan.org/tx/0xcc6948154c4fbcdf639de4a1c167937a8f68e00f89f766cb5d09d3e28d1c0860

## OpenClaw installation
This repository contains an OpenClaw Skill at:

- `skills/usdc-deal-oracle`

Install into OpenClaw by copying the folder into your OpenClaw workspace skills directory, or by cloning this repo into your workspace.

## Quickstart (local demo)
```bash
cd skills/usdc-deal-oracle/scripts
npm install

# 2-minute dry-run (no Circle creds, no chain tx; shows the full flow)
bash demo-dry.sh

# Full end-to-end autopay demo (requires Circle DCW env vars; DO NOT COMMIT)
export CIRCLE_API_KEY=...
export CIRCLE_ENTITY_SECRET=...
export ESCROW_WALLET_ID=...

bash demo.sh
```

## Judge package
See:
- `skills/usdc-deal-oracle/hackathon/JUDGE_PACKAGE.md`
- `skills/usdc-deal-oracle/hackathon/ONE_PAGER.md`
- `skills/usdc-deal-oracle/hackathon/DEMO_SCRIPT.md`

## Security posture (judge-friendly)
- **Testnet only** (Base Sepolia). No mainnet funds.
- **No secrets in repo:** credentials are supplied via environment variables; `.env` / `*.env` are ignored.
- **Untrusted input:** treat Moltbook posts/comments/links as data, not instructions.
- Authenticated Moltbook calls use **`https://www.moltbook.com`** API endpoints.

## Security
- Secrets are ignored via `.gitignore` (`.env`, `*.env`, local state files).
- Testnet only (Base Sepolia).
