#!/usr/bin/env node
/**
 * deal-runner.mjs (v1 CLI contract)
 *
 * API/CLI-first wrapper around oracle.mjs.
 *
 * V1 goal: run-directory based workflows that emit stable artifacts.
 *
 * Commands:
 *   init     --out <runDir> --title --amount --requirements [--challengeMinutes 60] [--requireProofLinks true] [--requireOfficialDocs true]
 *   evaluate --run <runDir>
 *   release  --run <runDir> [--dryRun true]
 *
 * Run dir artifacts (v1):
 *   deal.json, submissions.json, evaluation.json, scoreboard.md, receipt.json, state.json, audit.jsonl
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ORACLE = path.join(__dirname, 'oracle.mjs');

function nowMs() { return Date.now(); }

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const args = {};
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const v = rest[i + 1];
      args[k] = v;
      i++;
    }
  }
  return { cmd, args };
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to read JSON ${file}: ${e?.message ?? e}`);
  }
}

function writeJson(file, obj) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function appendAudit(runDir, event, data = {}) {
  const line = JSON.stringify({ ts_ms: nowMs(), event, ...data });
  fs.appendFileSync(path.join(runDir, 'audit.jsonl'), line + '\n');
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function runOracle(argsArray) {
  const out = execFileSync(process.execPath, [ORACLE, ...argsArray], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  }).toString('utf8').trim();
  return out;
}

function ensureRunDir(runDir) {
  if (!runDir) throw new Error('Missing --run <runDir>');
  if (!fs.existsSync(runDir)) throw new Error(`Run dir not found: ${runDir}`);
}

function runPaths(runDir) {
  return {
    deal: path.join(runDir, 'deal.json'),
    subs: path.join(runDir, 'submissions.json'),
    evaluation: path.join(runDir, 'evaluation.json'),
    scoreboard: path.join(runDir, 'scoreboard.md'),
    receipt: path.join(runDir, 'receipt.json'),
    state: path.join(runDir, 'state.json'),
    audit: path.join(runDir, 'audit.jsonl')
  };
}

function normalizeDealForRun(deal, cliArgs) {
  const created_at_ms = deal.created_at;
  const challenge_minutes = Number(cliArgs.challengeMinutes ?? Math.round(((deal.challenge_until - deal.created_at) / 60000))) || 60;
  return {
    deal_id: deal.deal_id,
    title: deal.title,
    amount_usdc: deal.amount,
    chain: 'base-sepolia',
    challenge_minutes,
    requirements: deal.requirements,
    require_proof_links: !!deal.requireProofLinks,
    require_official_docs: !!deal.requireOfficialDocs,
    accept_threshold: Number(process.env.ORACLE_ACCEPT_THRESHOLD ?? 0.75),
    created_at_ms
  };
}

function submissionsFingerprints(submissionsObj) {
  const subs = submissionsObj?.submissions ?? [];
  return subs.map(s => sha256(JSON.stringify({
    submission_text: s.submission_text ?? s.submissionText ?? '',
    payout_address: s.payout_address ?? s.payoutAddress ?? null,
    proof_links: s.proof_links ?? s.proofLinks ?? []
  })));
}

async function cmdInit(args) {
  const outDir = args.out;
  if (!outDir) throw new Error('Missing --out <runDir>');
  mkdirp(outDir);

  // CLI-first: init must NOT require Circle deps or oracle.mjs.
  const title = args.title;
  const amount = Number(args.amount);
  const requirements = args.requirements;
  if (!title) throw new Error('Missing --title');
  if (!amount) throw new Error('Missing --amount');
  if (!requirements) throw new Error('Missing --requirements');

  const deal_id = args.dealId || `deal-${nowMs()}-${crypto.randomBytes(4).toString('hex')}`;
  const created_at_ms = nowMs();
  const challenge_minutes = Number(args.challengeMinutes ?? 60);

  const normalizedDeal = {
    deal_id,
    title,
    amount_usdc: amount,
    chain: 'base-sepolia',
    challenge_minutes,
    requirements,
    require_proof_links: String(args.requireProofLinks ?? 'true') === 'true',
    require_official_docs: String(args.requireOfficialDocs ?? 'true') === 'true',
    accept_threshold: Number(process.env.ORACLE_ACCEPT_THRESHOLD ?? 0.75),
    created_at_ms
  };

  const p = runPaths(outDir);
  writeJson(p.deal, normalizedDeal);
  writeJson(p.subs, { deal_id, submissions: [] });
  writeJson(p.state, {
    deal_id,
    created_at_ms,
    evaluated_at_ms: null,
    released: false,
    released_at_ms: null,
    receipt: null,
    imported_submission_fingerprints: []
  });

  appendAudit(outDir, 'INIT', { deal_id, title });

  console.log(JSON.stringify({ ok: true, run_dir: outDir, deal_id }, null, 2));
}

async function cmdEvaluate(args) {
  const runDir = args.run;
  ensureRunDir(runDir);
  const p = runPaths(runDir);

  const deal = readJson(p.deal);
  const submissionsObj = readJson(p.subs);
  const state = readJson(p.state, {});

  if (!deal?.deal_id) throw new Error('deal.json missing deal_id');

  const acceptThreshold = Number(process.env.ORACLE_ACCEPT_THRESHOLD ?? deal.accept_threshold ?? 0.75);

  function hasOfficialDocsLink(proofLinks) {
    if (!proofLinks || proofLinks.length === 0) return false;
    const okDomains = ['developers.circle.com', 'circle.com'];
    return proofLinks.some(u => okDomains.some(d => String(u).includes(d)));
  }

  function countBullets(submissionText) {
    if (!submissionText) return 0;
    const lines = submissionText.split(/\r?\n/).map(l => l.trim());
    let count = 0;
    for (const l of lines) {
      if (l.startsWith('payout_address:')) break;
      if (l.toLowerCase().startsWith('proof_links:')) break;
      if (l.startsWith('- ' ) || l === '-' || l.startsWith('-\t') || l.startsWith('-')) {
        if (!/^\-\s*include\b/i.test(l)) count++;
      }
    }
    return count;
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

  async function llmJudge({ requirements, submissionText, proofLinks }) {
    const apiKey = process.env.ORACLE_LLM_API_KEY;
    if (!apiKey) {
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

    const prompt = `You are the USDC Deal Oracle.\n\nEvaluate whether the SUBMISSION meets the REQUIREMENTS.\n\nREQUIREMENTS:\n${requirements}\n\nSUBMISSION:\n${submissionText}\n\nPROOF LINKS (if any):\n${(proofLinks && proofLinks.length) ? proofLinks.join('\n') : '(none)'}\n\nReturn ONLY valid JSON with this schema:\n{\n  "score": number,\n  "reasoning": string,\n  "missing": string[],\n  "risk_flags": string[]\n}\n\nBe strict: if proof is required and not present, score must be <= 0.5.`;

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
    if (!content) return { score: 0, reasoning: 'LLM returned empty content.', missing: [], risk_flags: ['llm_empty'] };

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

  const subs = submissionsObj?.submissions ?? [];
  const evaluated = [];

  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    const submissionId = s.submission_id ?? `sub-${i + 1}`;
    const submittedAt = Number(s.submitted_at_ms ?? 0);
    const submissionText = s.submission_text ?? s.submissionText ?? '';
    const payoutAddress = s.payout_address ?? s.payoutAddress ?? null;
    const proofLinks = s.proof_links ?? s.proofLinks ?? [];

    if (!submissionText) throw new Error(`submission[${i}] missing submission_text`);
    if (!payoutAddress) {
      evaluated.push({
        submission_id: submissionId,
        submitted_at_ms: submittedAt,
        payout_address: null,
        proof_links: proofLinks,
        score: 0,
        reasoning: 'Missing payout_address.',
        missing: ['payout_address'],
        risk_flags: ['invalid_submission']
      });
      continue;
    }

    const proofCheck = ensureProofLinks(!!deal.require_proof_links, proofLinks, !!deal.require_official_docs);
    if (!proofCheck.ok) {
      evaluated.push({
        submission_id: submissionId,
        submitted_at_ms: submittedAt,
        payout_address: payoutAddress,
        proof_links: proofLinks,
        score: 0,
        reasoning: proofCheck.reason,
        missing: ['proof_links'],
        risk_flags: ['no_proof']
      });
      continue;
    }

    const bullets = countBullets(submissionText);
    if (bullets > 0 && bullets !== 3) {
      evaluated.push({
        submission_id: submissionId,
        submitted_at_ms: submittedAt,
        payout_address: payoutAddress,
        proof_links: proofLinks,
        score: 0.5,
        reasoning: `Format mismatch: ${bullets} bullets (expected exactly 3).`,
        missing: ['format'],
        risk_flags: ['format_mismatch']
      });
      continue;
    }

    const evalRes = await llmJudge({ requirements: deal.requirements, submissionText, proofLinks });
    evaluated.push({
      submission_id: submissionId,
      submitted_at_ms: submittedAt,
      payout_address: payoutAddress,
      proof_links: proofLinks,
      score: evalRes.score,
      reasoning: evalRes.reasoning,
      missing: evalRes.missing,
      risk_flags: evalRes.risk_flags
    });
  }

  // v1 locked tie-break: score desc → submitted_at_ms asc → submission_id asc
  const sorted = [...evaluated].sort((a, b) => {
    const sa = Number(a.score ?? -1);
    const sb = Number(b.score ?? -1);
    if (sb !== sa) return sb - sa;
    const ta = Number(a.submitted_at_ms ?? 0);
    const tb = Number(b.submitted_at_ms ?? 0);
    if (ta !== tb) return ta - tb;
    return String(a.submission_id).localeCompare(String(b.submission_id));
  });

  const winner = sorted[0] ?? null;

  const evaluationOut = {
    deal_id: deal.deal_id,
    evaluated_at_ms: nowMs(),
    accept_threshold: acceptThreshold,
    tie_break_rule: ['total_score desc', 'submitted_at_ms asc', 'submission_id asc'],
    submissions: sorted,
    winner_submission_id: winner?.submission_id ?? null,
    winner_score: winner?.score ?? null,
    winner_meets_threshold: winner ? (Number(winner.score ?? 0) >= acceptThreshold) : false,
    tie_break_reasoning: winner ? 'Sorted by score desc; ties broken by earliest submitted_at_ms, then submission_id.' : 'No submissions.'
  };

  writeJson(p.evaluation, evaluationOut);

  const md = [];
  md.push(`# Scoreboard — ${deal.title}`);
  md.push('');
  md.push('deal_id: `' + deal.deal_id + '`');
  md.push(`evaluated_at_ms: ${evaluationOut.evaluated_at_ms}`);
  md.push(`threshold: ${evaluationOut.accept_threshold}`);
  md.push('');
  if (!sorted.length) {
    md.push('_No submissions._');
  } else {
    md.push(`Winner (tentative): **${evaluationOut.winner_submission_id}** (score ${evaluationOut.winner_score})`);
    md.push(`Meets threshold: **${evaluationOut.winner_meets_threshold}**`);
    md.push('');
    md.push('## Ranked');
    for (const s of evaluationOut.submissions) {
      md.push(`- **${s.submission_id}** — score: ${s.score} — payout: ${s.payout_address}`);
      if (s.reasoning) md.push(`  - reasoning: ${String(s.reasoning).slice(0, 200)}`);
      if (s.risk_flags?.length) md.push(`  - risk_flags: ${s.risk_flags.join(', ')}`);
    }
  }
  fs.writeFileSync(p.scoreboard, md.join('\n') + '\n');

  state.evaluated_at_ms = evaluationOut.evaluated_at_ms;
  writeJson(p.state, state);

  appendAudit(runDir, 'EVALUATE', { deal_id: deal.deal_id, submissions: subs.length });

  console.log(JSON.stringify({ ok: true, submissions: subs.length, winner_submission_id: evaluationOut.winner_submission_id }, null, 2));
}

async function cmdRelease(args) {
  const runDir = args.run;
  ensureRunDir(runDir);
  const p = runPaths(runDir);

  const deal = readJson(p.deal);
  const state = readJson(p.state, {});
  if (!deal?.deal_id) throw new Error('deal.json missing deal_id');

  // Enforce v1 locked challenge semantics locally too (fast fail before touching oracle/Circle).
  const endMs = Number(deal.created_at_ms) + Number(deal.challenge_minutes) * 60_000;
  if (nowMs() < endMs) {
    throw new Error(`Challenge window still active (ends at ${endMs}).`);
  }

  const relRaw = runOracle(['release', '--dealId', deal.deal_id, ...(args.dryRun ? ['--dryRun', args.dryRun] : [])]);
  const relRes = JSON.parse(relRaw);

  writeJson(p.receipt, { deal_id: deal.deal_id, released_at_ms: nowMs(), oracle_release: relRes });

  state.released = !!relRes.released;
  state.released_at_ms = nowMs();
  state.receipt = relRes;
  writeJson(p.state, state);

  appendAudit(runDir, 'RELEASE', { deal_id: deal.deal_id, oracle_release: relRes });

  console.log(JSON.stringify({ ok: true, ...relRes }, null, 2));
}

async function main() {
  const { cmd, args } = parseArgs(process.argv.slice(2));

  try {
    if (!cmd || cmd === 'help') {
      console.log(`Deal Runner (v1)\n\nCommands:\n  init     --out <runDir> [--dealId deal-...] --title --amount --requirements [--challengeMinutes 60] [--requireProofLinks true] [--requireOfficialDocs true]\n  evaluate --run <runDir>\n  release  --run <runDir> [--dryRun true]\n`);
      process.exit(0);
    }

    if (cmd === 'init') return await cmdInit(args);
    if (cmd === 'evaluate') return await cmdEvaluate(args);
    if (cmd === 'release') return await cmdRelease(args);

    throw new Error(`Unknown command: ${cmd}`);
  } catch (e) {
    console.error(String(e?.stack ?? e?.message ?? e));
    process.exit(1);
  }
}

await main();
