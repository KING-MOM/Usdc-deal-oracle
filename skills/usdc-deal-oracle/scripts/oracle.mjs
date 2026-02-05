#!/usr/bin/env node
/**
 * USDC Deal Oracle (Hackathon MVP)
 *
 * - Persists deals to ./deals.json
 * - Supports multiple submissions per deal
 * - Evaluates submissions with a lightweight LLM rubric (OpenAI-compatible)
 * - After the challenge window, auto-releases to the BEST submission (highest score)
 *   if deterministic proof checks pass.
 *
 * Env (Circle):
 *   CIRCLE_API_KEY
 *   CIRCLE_ENTITY_SECRET
 *   ESCROW_WALLET_ID
 *
 * Env (LLM, optional but recommended):
 *   ORACLE_LLM_API_KEY
 *   ORACLE_LLM_BASE_URL          (default https://api.openai.com/v1)
 *   ORACLE_LLM_MODEL             (default gpt-4.1-mini)
 *   ORACLE_ACCEPT_THRESHOLD      (default 0.75)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { logAudit } from './logger.mjs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DEALS_FILE = path.join(__dirname, 'deals.json');

function nowMs() { return Date.now(); }

function readDeals() {
  try {
    if (!fs.existsSync(DEALS_FILE)) return {};
    const raw = fs.readFileSync(DEALS_FILE, 'utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to read deals file: ${e?.message ?? e}`);
  }
}

function writeDeals(deals) {
  fs.writeFileSync(DEALS_FILE, JSON.stringify(deals, null, 2));
}

function id(prefix) {
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${Date.now()}-${rand}`;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getCircleClient() {
  const apiKey = requireEnv('CIRCLE_API_KEY');
  const entitySecret = requireEnv('CIRCLE_ENTITY_SECRET');
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

function parseOptionalPayoutAddress(text) {
  // Accept either:
  // payout_address: 0x...
  // or a bare 0x... on its own line
  if (!text) return null;
  const m = text.match(/payout_address\s*:\s*(0x[a-fA-F0-9]{40})/);
  if (m) return m[1];
  const m2 = text.match(/\b(0x[a-fA-F0-9]{40})\b/);
  return m2 ? m2[1] : null;
}

function parseProofLinks(text, proofLinksCsv) {
  const links = [];
  if (proofLinksCsv) {
    links.push(...proofLinksCsv.split(',').map(s => s.trim()).filter(Boolean));
  }
  if (text) {
    const m = text.match(/proof_links\s*:\s*(.+)$/im);
    if (m) {
      links.push(...m[1].split(',').map(s => s.trim()).filter(Boolean));
    }
  }
  // dedupe
  return Array.from(new Set(links));
}

async function llmJudge({ requirements, submissionText, proofLinks }) {
  const apiKey = process.env.ORACLE_LLM_API_KEY;
  if (!apiKey) {
    // Demo-safe fallback: only allow deterministic accept if explicitly enabled.
    if (String(process.env.ORACLE_ALLOW_DETERMINISTIC_ACCEPT || 'false') === 'true') {
      return {
        score: 0.8,
        reasoning: 'Deterministic fallback (no ORACLE_LLM_API_KEY).',
        missing: [],
        risk_flags: ['no_llm_key', 'deterministic_fallback']
      };
    }
    return {
      score: 0,
      reasoning: 'ORACLE_LLM_API_KEY not set; cannot evaluate automatically.',
      missing: ['LLM disabled'],
      risk_flags: ['no_llm_key']
    };
  }

  const baseUrl = process.env.ORACLE_LLM_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.ORACLE_LLM_MODEL || 'gpt-4.1-mini';

  const prompt = `You are the USDC Deal Oracle.\n\nEvaluate whether the SUBMISSION meets the REQUIREMENTS.\n\nREQUIREMENTS:\n${requirements}\n\nSUBMISSION:\n${submissionText}\n\nPROOF LINKS (if any):\n${(proofLinks && proofLinks.length) ? proofLinks.join('\n') : '(none)'}\n\nReturn ONLY valid JSON with this schema:\n{\n  "score": number,              // 0.0 to 1.0\n  "reasoning": string,          // brief\n  "missing": string[],          // missing requirements/proof\n  "risk_flags": string[]        // e.g. "unclear", "no_proof", "spam", "unsafe"\n}\n\nBe strict: if proof is required and not present, score must be <= 0.5.`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a careful evaluator. Output only JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      score: 0,
      reasoning: `LLM request failed: HTTP ${res.status}`,
      missing: [],
      risk_flags: ['llm_http_error', text.slice(0, 120)]
    };
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    return { score: 0, reasoning: 'LLM returned empty content.', missing: [], risk_flags: ['llm_empty'] };
  }

  try {
    const parsed = JSON.parse(content);
    const score = typeof parsed.score === 'number' ? parsed.score : 0;
    return {
      score: Math.max(0, Math.min(1, score)),
      reasoning: String(parsed.reasoning ?? ''),
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String) : [],
      risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags.map(String) : []
    };
  } catch {
    return { score: 0, reasoning: `LLM returned non-JSON: ${content.slice(0, 200)}`, missing: [], risk_flags: ['llm_bad_json'] };
  }
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const args = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const val = rest[i + 1];
      args[key] = val;
      i++;
    }
  }
  return { cmd, args };
}

function countBullets(submissionText) {
  if (!submissionText) return 0;
  const lines = submissionText.split(/\r?\n/).map(l => l.trim());
  let count = 0;
  for (const l of lines) {
    if (l.startsWith('payout_address:')) break;
    if (l.toLowerCase().startsWith('proof_links:')) break;
    if (l.startsWith('- ' ) || l === '-' || l.startsWith('-\t') || l.startsWith('-')) {
      // treat "- foo" as a bullet; exclude section markers like "- Include:"
      if (!/^\-\s*include\b/i.test(l)) count++;
    }
  }
  return count;
}

function hasOfficialDocsLink(proofLinks) {
  if (!proofLinks || proofLinks.length === 0) return false;
  const okDomains = ['developers.circle.com', 'circle.com'];
  return proofLinks.some(u => okDomains.some(d => String(u).includes(d)));
}

function ensureProofLinks(requireProofLinks, proofLinks, requireOfficialDocs = false) {
  if (requireProofLinks && (!proofLinks || proofLinks.length === 0)) {
    return { ok: false, reason: 'Missing proof links (require_proof_links=true).' };
  }
  if (requireOfficialDocs && !hasOfficialDocsLink(proofLinks)) {
    return { ok: false, reason: 'Missing official Circle docs link (developers.circle.com / circle.com) in proof_links.' };
  }
  return { ok: true };
}

async function createDeal({ title, amount, requirements, challengeMinutes, requireProofLinks, requireOfficialDocs }) {
  if (!title) throw new Error('Missing --title');
  if (!amount) throw new Error('Missing --amount');
  if (!requirements) throw new Error('Missing --requirements');

  const dealId = id('deal');
  const deals = readDeals();

  const challengeMs = (Number(challengeMinutes ?? 60) * 60 * 1000);

  deals[dealId] = {
    deal_id: dealId,
    title,
    status: 'OPEN',
    amount: Number(amount),
    requirements,
    created_at: nowMs(),
    challenge_until: nowMs() + challengeMs,
    requireProofLinks: String(requireProofLinks ?? 'true') === 'true',
    requireOfficialDocs: String(requireOfficialDocs ?? 'true') === 'true',
    disputed: false,
    dispute_reason: null,
    submissions: [],
    winner_submission_id: null,
    circle_tx_id: null
  };

  writeDeals(deals);
  logAudit('CREATE', { deal_id: dealId, title, amount: Number(amount), challenge_until: deals[dealId].challenge_until });
  return deals[dealId];
}

async function submit({ dealId, submissionText, proofLinks, payoutAddress }) {
  if (!dealId) throw new Error('Missing --dealId');
  if (!submissionText) throw new Error('Missing --submissionText');

  const deals = readDeals();
  const deal = deals[dealId];
  if (!deal) throw new Error(`Unknown dealId: ${dealId}`);

  const payout = payoutAddress || parseOptionalPayoutAddress(submissionText);
  if (!payout) throw new Error('Missing payout address. Provide --payoutAddress or include payout_address: 0x... in submissionText');

  const links = parseProofLinks(submissionText, proofLinks);
  const proofCheck = ensureProofLinks(deal.requireProofLinks, links, deal.requireOfficialDocs);
  const bullets = countBullets(submissionText);
  const bulletHint = (bullets > 0 && bullets !== 3)
    ? `Submission has ${bullets} bullets; expected exactly 3 for this deal.`
    : null;

  const submissionId = id('sub');
  const entry = {
    submission_id: submissionId,
    submitted_at: nowMs(),
    payout_address: payout,
    submission_text: submissionText,
    proof_links: links,
    evaluation: (!proofCheck.ok)
      ? { score: 0, reasoning: proofCheck.reason, missing: ['proof_links'], risk_flags: ['no_proof'], evaluated_at: nowMs() }
      : (bulletHint ? { score: 0.5, reasoning: bulletHint, missing: ['format'], risk_flags: ['format_mismatch'], evaluated_at: nowMs() } : null)
  };

  deal.submissions.push(entry);
  deal.status = 'SUBMITTED';
  deal.updated_at = nowMs();

  writeDeals(deals);
  logAudit('SUBMIT', { deal_id: dealId, submission_id: submissionId, payout_address: payout });
  return { deal_id: dealId, submission_id: submissionId };
}

async function evaluate({ dealId, submissionId }) {
  if (!dealId) throw new Error('Missing --dealId');

  const deals = readDeals();
  const deal = deals[dealId];
  if (!deal) throw new Error(`Unknown dealId: ${dealId}`);

  const subs = deal.submissions || [];
  if (subs.length === 0) throw new Error('No submissions yet.');

  const targets = submissionId ? subs.filter(s => s.submission_id === submissionId) : subs.filter(s => !s.evaluation);
  if (targets.length === 0) {
    return { ok: true, note: 'Nothing to evaluate.' };
  }

  for (const s of targets) {
    const proofCheck = ensureProofLinks(deal.requireProofLinks, s.proof_links, deal.requireOfficialDocs);
    if (!proofCheck.ok) {
      s.evaluation = { score: 0, reasoning: proofCheck.reason, missing: ['proof_links'], risk_flags: ['no_proof'], evaluated_at: nowMs() };
      continue;
    }

    const bullets = countBullets(s.submission_text);
    if (bullets > 0 && bullets !== 3) {
      // deterministic penalty: keep it eligible but reduce score ceiling
      s.evaluation = { score: 0.5, reasoning: `Format mismatch: ${bullets} bullets (expected exactly 3).`, missing: ['format'], risk_flags: ['format_mismatch'], evaluated_at: nowMs() };
      continue;
    }

    const evalRes = await llmJudge({
      requirements: deal.requirements,
      submissionText: s.submission_text,
      proofLinks: s.proof_links
    });

    s.evaluation = { ...evalRes, evaluated_at: nowMs() };
  }

  deal.status = 'EVALUATED';
  deal.updated_at = nowMs();
  writeDeals(deals);

  logAudit('EVALUATE', { deal_id: dealId, evaluated: targets.map(t => t.submission_id) });
  return { ok: true, evaluated: targets.map(t => t.submission_id) };
}

async function release({ dealId }) {
  if (!dealId) throw new Error('Missing --dealId');

  const deals = readDeals();
  const deal = deals[dealId];
  if (!deal) throw new Error(`Unknown dealId: ${dealId}`);

  const threshold = Number(process.env.ORACLE_ACCEPT_THRESHOLD ?? 0.75);

  if (deal.disputed) {
    deal.status = 'DISPUTED';
    deal.updated_at = nowMs();
    writeDeals(deals);
    return { released: false, reason: `Deal is disputed: ${deal.dispute_reason || 'no reason provided'}` };
  }

  if (nowMs() < deal.challenge_until) {
    deal.status = 'CHALLENGE_WINDOW';
    deal.updated_at = nowMs();
    writeDeals(deals);
    return { released: false, reason: 'Challenge window still active.', challenge_until: deal.challenge_until };
  }

  if (deal.circle_tx_id) {
    return { released: true, tx_id: deal.circle_tx_id, note: 'Already released.', winner_submission_id: deal.winner_submission_id };
  }

  const subs = (deal.submissions || []).filter(s => s.evaluation && typeof s.evaluation.score === 'number');
  if (subs.length === 0) throw new Error('No evaluated submissions. Run evaluate first.');

  subs.sort((a, b) => (b.evaluation.score - a.evaluation.score));
  const best = subs[0];

  if (best.evaluation.score < threshold) {
    deal.status = 'REJECTED';
    deal.updated_at = nowMs();
    writeDeals(deals);
    return { released: false, reason: `Best score ${best.evaluation.score} below threshold ${threshold}` };
  }

  const payout = best.payout_address;
  if (!payout) throw new Error('Winner missing payout address.');

  const client = getCircleClient();
  const escrowWalletId = requireEnv('ESCROW_WALLET_ID');

  // Resolve tokenId for USDC (avoid accidentally selecting native gas token).
  const bal = await client.getWalletTokenBalance({ id: escrowWalletId });
  const tbs = bal?.data?.tokenBalances ?? [];
  const usdc = tbs.find(tb => (tb?.token?.symbol || '').toUpperCase() === 'USDC')
    || tbs.find(tb => tb?.token?.isNative === false)
    || tbs.find(tb => tb?.token?.tokenAddress);
  const tokenId = usdc?.token?.id;
  if (!tokenId) throw new Error('Could not resolve USDC tokenId from wallet token balances. Fund wallet with testnet USDC first.');

  async function createTransactionWithRetry(params, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await client.createTransaction(params);
      } catch (err) {
        if (attempt === maxRetries - 1) throw err;
        const delay = (2 ** attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  const tx = await createTransactionWithRetry({
    walletId: escrowWalletId,
    destinationAddress: payout,
    tokenId,
    amount: [String(deal.amount)],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });

  const txId = tx?.data?.id || tx?.id;

  deal.circle_tx_id = txId ?? null;
  deal.winner_submission_id = best.submission_id;
  deal.status = 'COMPLETED';
  deal.updated_at = nowMs();
  writeDeals(deals);

  logAudit('RELEASE', { deal_id: dealId, tx_id: txId, winner_submission_id: best.submission_id, winner_payout_address: payout, score: best.evaluation.score });
  return { released: true, tx_id: txId, winner_submission_id: best.submission_id, winner_payout_address: payout, score: best.evaluation.score };
}

async function dispute({ dealId, reason }) {
  if (!dealId) throw new Error('Missing --dealId');
  const deals = readDeals();
  const deal = deals[dealId];
  if (!deal) throw new Error(`Unknown dealId: ${dealId}`);

  deal.disputed = true;
  deal.dispute_reason = reason || 'manual dispute';
  deal.status = 'DISPUTED';
  deal.updated_at = nowMs();
  writeDeals(deals);

  logAudit('DISPUTE', { deal_id: dealId, reason: deal.dispute_reason });
  return { ok: true, deal_id: dealId, status: 'DISPUTED' };
}

async function status({ dealId }) {
  const deals = readDeals();
  if (dealId) {
    const deal = deals[dealId];
    if (!deal) throw new Error(`Unknown dealId: ${dealId}`);
    return deal;
  }
  return Object.values(deals);
}

async function main() {
  const { cmd, args } = parseArgs(process.argv.slice(2));

  try {
    if (!cmd || cmd === 'help') {
      console.log(`USDC Deal Oracle\n\nCommands:\n  create   --title --amount --requirements [--challengeMinutes 60] [--requireProofLinks true] [--requireOfficialDocs true]\n  submit   --dealId --submissionText [--proofLinks url1,url2] [--payoutAddress 0x..]\n  evaluate --dealId [--submissionId sub-...]\n  release  --dealId\n  dispute  --dealId --reason "..."\n  status   [--dealId]\n`);
      process.exit(0);
    }

    if (cmd === 'create') {
      const out = await createDeal({
        title: args.title,
        amount: args.amount,
        requirements: args.requirements,
        challengeMinutes: args.challengeMinutes,
        requireProofLinks: args.requireProofLinks,
        requireOfficialDocs: args.requireOfficialDocs
      });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'submit') {
      const out = await submit({
        dealId: args.dealId,
        submissionText: args.submissionText,
        proofLinks: args.proofLinks,
        payoutAddress: args.payoutAddress
      });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'evaluate') {
      const out = await evaluate({ dealId: args.dealId, submissionId: args.submissionId });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'release') {
      const out = await release({ dealId: args.dealId });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'dispute') {
      const out = await dispute({ dealId: args.dealId, reason: args.reason });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'status') {
      const out = await status({ dealId: args.dealId });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    throw new Error(`Unknown command: ${cmd}`);
  } catch (e) {
    console.error(`Error: ${e?.message ?? e}`);
    process.exit(1);
  }
}

await main();
