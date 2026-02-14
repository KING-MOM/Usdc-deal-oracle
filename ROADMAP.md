# Deal Oracle — Roadmap (post-hackathon)

## North Star
Turn Deal Oracle into a **reusable OpenClaw Skill** that lets anyone run an optimistic escrow deal:
- create/publish a deal (or ingest an existing post)
- collect submissions
- evaluate (deterministic + optional LLM)
- enforce a **challenge window**
- settle USDC (testnet first; mainnet later)

The product is: **repeatable deals with verifiable payouts and a clean audit trail**.

## Target user (v1)
A builder/community operator running small bounties who wants:
- consistent submission format
- automatic eligibility checks
- a transparent scoring/selection process
- automatic payout **only after** a dispute period

## Product shape (v1)

### V1 CLI contract (API/CLI-first)
Everything runs from a **run directory** and produces stable artifacts.

**Run dir layout (v1):**
- `deal.json` (input)
- `submissions.json` (input)
- `evaluation.json` (output)
- `scoreboard.md` (output)
- `receipt.json` (output; after release)
- `state.json` (internal state; idempotency/checkpoints)
- `audit.jsonl` (append-only)

**Commands (v1):**
- `init` → create run dir + `deal.json` + empty `submissions.json`
- `evaluate` → produce `evaluation.json` + `scoreboard.md`
- `release` → enforce challenge window + pay once + write `receipt.json`

### Inputs
- Deal config (`deal.json`): amount, chain, token, requirements, **challenge window**, accept threshold
- Submissions (`submissions.json`): normalized submissions with `submitted_at_ms`, `payout_address`, `proof_links`, `submission_text`

### Outputs
- Public scoreboard (`scoreboard.md`) + machine output (`evaluation.json`)
- Receipt (`receipt.json`) that includes tx identifiers/links
- Local audit log (`audit.jsonl`, append-only)

## Milestones

### M0 — “Repeatable local demo” (1–2 days)
**Goal:** Any dev can rerun the E2E flow locally in <10 minutes.
- [ ] One command: `bash demo.sh` produces:
  - deal.json
  - submissions.json
  - evaluation.json
  - receipt.json
  - audit.jsonl
- [ ] Clear failure modes (missing env, rate limits, chain RPC issues)

### M1 — “Live deal runner (manual trigger)” (2–5 days)
**Goal:** Run a real Moltbook deal with manual step controls.
- [ ] `listener.mjs once` ingest deal + submissions
- [ ] `oracle.mjs evaluate --dealId ...` produces deterministic + (optional) LLM scores
- [ ] `oracle.mjs release --dealId ...` enforces:
  - challenge window elapsed
  - deterministic checks pass
  - score >= threshold
- [ ] Tie-break spec implemented (see below)

### M2 — “Automation (watch mode)” (1–2 weeks)
**Goal:** A single long-running process can:
- detect new submissions
- re-evaluate
- settle automatically when the window ends
- post receipt

### M3 — “Dispute / challenge mechanism” (later)
**Goal:** disputes are first-class:
- dispute submission
- pause release
- resolve outcome

## Critical spec decisions to lock (v1)

### 1) Tie-break rule (v1 locked)
Deterministic winner selection order:
1. Highest `total_score` wins
2. If tied: earliest `submitted_at_ms` wins
3. If still tied: lexicographic order of `submission_id`

Notes:
- This rule MUST be implemented in code and reflected in `evaluation.json` (include tie-break reasoning).

### 2) Challenge window semantics (v1 locked)
- **Anchor:** `deal.created_at_ms` (set at `init` time)
- **End time:** `deal.created_at_ms + challenge_minutes * 60_000`
- **Release gating:** `release` MUST hard-fail (exit non-zero) if `now_ms < end_time_ms`
- **Challenges/disputes:** out-of-scope for v1 (reserve fields + audit events; implement later)

### 3) What is “deterministic acceptance”
Enumerate hard gates:
- valid payout_address
- required proof_links present
- required official docs link present
- formatting constraints

## Engineering checklist (hardening)
- [ ] Normalize and sanitize all untrusted text
- [ ] Store raw inputs + normalized forms in audit
- [ ] Make release idempotent (safe to re-run)
- [ ] Ensure chain/network is explicit everywhere (Base Sepolia)

## Distribution
- OpenClaw skill folder: `skills/usdc-deal-oracle`
- Optional: publish to Clawhub later
