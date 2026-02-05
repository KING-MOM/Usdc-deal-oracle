#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "🎬 USDC Deal Oracle — local demo"

node ./check-env.mjs

# Sanity: balance
echo
echo "💰 Checking escrow token balance…"
node ./circle-balance.mjs || true

# Create a short-window local deal
echo
echo "📋 Creating demo deal (5 min window)…"
DEAL_JSON=$(node ./oracle.mjs create \
  --title "Demo Deal: 10 USDC for best 3-bullet Circle DCW summary" \
  --amount 1 \
  --requirements "Exactly 3 bullets. Each bullet must mention 1 concrete feature of Circle Developer-Controlled Wallets." \
  --challengeMinutes 5 \
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
echo "⏳ Waiting for challenge window (5 min)…"
sleep 310

echo
echo "💸 Releasing (will transfer 1 USDC to the best submission)…"
node ./oracle.mjs release --dealId "$DEAL_ID"

echo
echo "✅ Demo complete. See scripts/audit.jsonl for an audit trail."
