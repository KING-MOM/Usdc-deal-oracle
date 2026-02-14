# Agent Wallets w/ Human-in-the-Loop (HITL) — 1-page Spec (v0)

## Problem
Today’s agents can *decide* but they can’t safely *act with money*.

Two failure modes block real agentic commerce:
1) **Key risk / fraud risk:** giving an agent a hot wallet is unacceptable.
2) **Workflow friction:** if every payment requires a human to manually copy/paste addresses + amounts, the “agent” is just a chat UI.

We want a wallet that lets an agent execute useful payments **within strict policy**, and escalates to a human only when risk is higher than the policy allows.

## MVP (what we ship)
**Goal:** an agent can pay for small, well-scoped tasks (bounties, reimbursements, micro-purchases) with an auditable trail, while a human retains ultimate control.

### Core entities
- **Wallet Set (agent role):** a Circle DCW wallet set dedicated to a single agent role / business context.
- **Policy:** limits + allowlists + required approvals.
- **Payment Intent:** a proposed transaction (who/what/why/how much) that must pass policy.
- **Approval Event:** HITL approval (or denial) with a reason.
- **Receipt:** chain tx hash + metadata + links.

## MVP Flow
1) **Agent proposes a Payment Intent**
   - fields: payee address, amount, token, chain, memo, proof links, related deal/task id.
2) **Policy engine evaluates**
   - If within policy → auto-approve.
   - If outside policy → require human approval.
3) **(Optional) HITL approval**
   - human sees a compact summary + risk flags + “Approve / Deny”.
4) **Execute via DCW**
   - create transaction through Circle DCW (no raw private keys).
5) **Audit + receipt**
   - write an append-only audit record and return a shareable receipt link (e.g., BaseScan).

## Trust & Safety Policy (minimum viable)
**Hard constraints (must pass):**
- **Token + chain allowlist** (e.g., USDC on Base Sepolia; later: Base mainnet).
- **Amount limits**
  - per-tx max
  - per-day max
  - per-payee rolling max
- **Payee allowlist / registry**
  - known vendors, internal wallets, or payees created from verified workflow.
- **Proof requirements**
  - require links (invoice, order, task completion) + optional “official docs” rule.
- **Idempotency + replay protection**
  - Payment Intent ID; do not pay twice for the same intent.
- **Rate limiting**
  - max tx count per hour/day.

**Escalation rules (require HITL):**
- new/unseen payee
- amount above threshold
- unusual token/chain
- missing/low-quality proof links
- mismatch between intent memo and proof

**Operational safety:**
- separate wallet sets per use-case (blast radius containment)
- explicit environment separation (testnet vs mainnet)
- “break glass” kill switch (disable auto-approve)

## Monetization angle
- **Usage-based fee per executed transaction** (e.g., $0.05–$0.50 depending on risk tier).
- **SaaS for policy + approvals + audit** (seat-based for approvers + usage for transactions).
- **Marketplace / deal rails**
  - take a % of escrowed deal volume for verified completion + settlement.

## What this enables (why it matters)
- “Agents that can actually buy things” without handing them keys.
- Faster micro-commerce: bounties, content tasks, procurement, reimbursements.
- Compliance-friendly auditability: every payment has a reason, links, and an approval trail.

## Non-goals (v0)
- Cross-chain routing, advanced compliance, vendor onboarding automation.
- Fully autonomous large payments.
