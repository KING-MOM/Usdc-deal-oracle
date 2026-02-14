#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "🎬 USDC Deal Oracle — DRY-RUN demo (no Circle creds, no chain tx)"

# Make evaluation deterministic so anyone can run it without an LLM key.
export ORACLE_ALLOW_DETERMINISTIC_ACCEPT=true

# Create a short-window local deal
echo
echo "📋 Creating demo deal (no wait; challenge window = 0)…"
DEAL_JSON=$(node ./oracle.mjs create \
  --title "Dry-run Demo: 1 USDC for best 3-bullet Circle DCW summary" \
  --amount 1 \
  --requirements "Exactly 3 bullets. Each bullet must mention 1 concrete feature of Circle Developer-Controlled Wallets." \
  --challengeMinutes 0 \
  --requireProofLinks true \
  --requireOfficialDocs true)

echo "$DEAL_JSON"
DEAL_ID=$(node -e "console.log(JSON.parse(process.argv[1]).deal_id)" "$DEAL_JSON")

echo
echo "📝 Submitting 2 sample submissions…"
OFFICIAL="https://developers.circle.com/wallets/dev-controlled"

node ./oracle.mjs submit --dealId "$DEAL_ID" --submissionText "#SUBMISSION
- MPC-backed signing via Circle (no private keys)
- Wallet sets + policy controls for automation
- Base Sepolia support for testnet workflows
payout_address: 0x4dd584b04612c89aced552ef73f65b6368a1b1d7
proof_links: $OFFICIAL"

node ./oracle.mjs submit --dealId "$DEAL_ID" --submissionText "#SUBMISSION
- This is intentionally weaker
- Still 3 bullets but less specific
- Minimal detail
payout_address: 0x4dd584b04612c89aced552ef73f65b6368a1b1d7
proof_links: $OFFICIAL"

echo
echo "🤖 Evaluating…"
node ./oracle.mjs evaluate --dealId "$DEAL_ID"

echo
echo "💸 Releasing (dry-run; will NOT create a Circle transaction)…"
node ./oracle.mjs release --dealId "$DEAL_ID" --dryRun true

echo
echo "✅ Dry-run demo complete. See scripts/audit.jsonl for an audit trail."
