# OpenClaw Ready

This repo is structured to be drop-in compatible with **OpenClaw**.

## Skill location
- `skills/usdc-deal-oracle`

## Install (typical)
Clone this repo into your OpenClaw workspace:
```bash
cd ~/.openclaw/workspace
git clone https://github.com/KING-MOM/Usdc-deal-oracle
```

OpenClaw will discover the skill folder under `skills/`.

## Run locally
```bash
cd Usdc-deal-oracle/skills/usdc-deal-oracle/scripts
# (If you cloned into a different folder name, adjust the path accordingly.)
npm install

# 2-minute dry-run (no Circle creds, no chain tx; shows the full flow)
bash demo-dry.sh

# Full end-to-end autopay demo (requires Circle DCW env vars)
export CIRCLE_API_KEY=...
export CIRCLE_ENTITY_SECRET=...
export ESCROW_WALLET_ID=...

# Optional (LLM scoring)
export ORACLE_LLM_API_KEY=...
# Demo fallback if LLM is rate-limited/unavailable
export ORACLE_ALLOW_DETERMINISTIC_ACCEPT=true

bash demo.sh
```

## Notes
- Secrets must never be committed. `.gitignore` includes `.env` / `*.env`.
- Runtime state files (e.g. `deals.json`, `*-state.json`, `audit.jsonl`) are ignored.
- Testnet only (Base Sepolia).
