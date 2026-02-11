#!/usr/bin/env node
/**
 * github-ingest.mjs (v1)
 *
 * Build a Deal Runner run-directory from GitHub:
 * - Deal = GitHub Issue
 * - Submissions = MERGED PRs that reference the issue (search-based v1)
 * - Each PR must include: payout_address: 0x... in the PR body
 *
 * Usage:
 *   node github-ingest.mjs ingest --repo owner/name --issue 123 --out runs/deal-issue-123
 *
 * Env:
 *   GITHUB_TOKEN (recommended; needed for higher rate limits and private repos)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function nowMs() { return Date.now(); }

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const args = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t.startsWith('--')) {
      args[t.slice(2)] = rest[i + 1];
      i++;
    } else {
      args._.push(t);
    }
  }
  return { cmd, args };
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, obj) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function appendAudit(outDir, event, data = {}) {
  const line = JSON.stringify({ ts_ms: nowMs(), event, ...data });
  fs.appendFileSync(path.join(outDir, 'audit.jsonl'), line + '\n');
}

function requireArg(args, key) {
  const v = args[key];
  if (!v) throw new Error(`Missing --${key}`);
  return v;
}

function parseRepo(repo) {
  const m = String(repo).split('/');
  if (m.length !== 2) throw new Error(`Invalid --repo, expected owner/name, got: ${repo}`);
  return { owner: m[0], name: m[1] };
}

function parseIsoToMs(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`Bad ISO timestamp: ${iso}`);
  return ms;
}

function extractFencedBlock(body, fenceName = 'deal') {
  if (!body) return null;
  // Support both \n and \r\n newlines.
  const re = new RegExp('```' + fenceName + '\\s*\\r?\\n([\\s\\S]*?)\\r?\\n```', 'i');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function parseKeyValues(text) {
  // Very small parser: lines like `key: value`
  // Supports multiline value with `requirements: |` then indented lines.
  const out = {};
  if (!text) return out;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val === '|') {
      const buf = [];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (/^\s{2,}/.test(l)) {
          buf.push(l.replace(/^\s{2}/, ''));
          i++;
          continue;
        }
        i--; // step back one so outer loop processes this line
        break;
      }
      out[key] = buf.join('\n').trim();
    } else {
      out[key] = String(val).trim();
    }
  }
  return out;
}

function parseDealFromIssue({ issueNumber, issueTitle, issueBody, issueCreatedAtIso }) {
  const block = extractFencedBlock(issueBody, 'deal');
  const kv = parseKeyValues(block || issueBody);

  const amount_usdc = Number(kv.amount_usdc ?? kv.amount ?? 0) || 0;
  const challenge_minutes = Number(kv.challenge_minutes ?? kv.challengeMinutes ?? 60) || 60;
  const accept_threshold = Number(kv.accept_threshold ?? kv.acceptThreshold ?? 0.75) || 0.75;
  const require_proof_links = String(kv.require_proof_links ?? kv.requireProofLinks ?? 'true') === 'true';
  const require_official_docs = String(kv.require_official_docs ?? kv.requireOfficialDocs ?? 'false') === 'true';

  const requirements = kv.requirements || kv.rules || issueTitle;

  return {
    deal_id: `deal-issue-${issueNumber}`,
    title: issueTitle,
    amount_usdc: amount_usdc || 0,
    chain: String(kv.chain ?? 'base-sepolia'),
    challenge_minutes,
    requirements,
    require_proof_links,
    require_official_docs,
    accept_threshold,
    created_at_ms: parseIsoToMs(issueCreatedAtIso),
    source: 'github',
    source_issue_number: Number(issueNumber),
  };
}

function extractPayoutAddressFromPrBody(body) {
  if (!body) return null;
  const m = body.match(/payout_address\s*:\s*(0x[a-fA-F0-9]{40})/i);
  return m ? m[1] : null;
}

function extractUrls(text) {
  if (!text) return [];
  const re = /(https?:\/\/[^\s)\]]+)/g;
  const out = [];
  for (const m of text.matchAll(re)) out.push(m[1]);
  return Array.from(new Set(out));
}

async function ghFetch(url, { token }) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API error ${res.status} for ${url}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

async function ingest({ repo, issueNumber, outDir }) {
  const token = process.env.GITHUB_TOKEN || '';
  const { owner, name } = parseRepo(repo);

  mkdirp(outDir);

  // 1) Fetch issue
  const issueUrl = `https://api.github.com/repos/${owner}/${name}/issues/${issueNumber}`;
  const issue = await ghFetch(issueUrl, { token });

  const deal = parseDealFromIssue({
    issueNumber,
    issueTitle: issue.title,
    issueBody: issue.body || '',
    issueCreatedAtIso: issue.created_at
  });

  // 2) Find merged PRs that reference #issueNumber (v1 = search-based)
  // Search is best-effort: matches PR title/body/comments.
  const q = encodeURIComponent(`repo:${owner}/${name} is:pr is:merged ${issueNumber}`);
  const searchUrl = `https://api.github.com/search/issues?q=${q}&per_page=100`;
  const search = await ghFetch(searchUrl, { token });
  const items = Array.isArray(search.items) ? search.items : [];

  const submissions = [];

  for (const it of items) {
    // search/issues returns PRs as issues with pull_request field
    if (!it.pull_request?.url) continue;

    const pr = await ghFetch(it.pull_request.url, { token });
    if (!pr.merged_at) continue; // merged-only v1 rule

    const payout = extractPayoutAddressFromPrBody(pr.body || '');
    if (!payout) continue; // v1 eligibility gate

    const proofLinks = Array.from(new Set([
      pr.html_url,
      ...(extractUrls(pr.body || ''))
    ]));

    submissions.push({
      submission_id: `pr-${pr.number}`,
      submitted_at_ms: parseIsoToMs(pr.created_at),
      submission_text: `#PR_SUBMISSION\n\nTitle: ${pr.title}\nPR: ${pr.html_url}\n\nBody:\n${pr.body || ''}`,
      payout_address: payout,
      proof_links: proofLinks,
      github: {
        pr_number: pr.number,
        pr_url: pr.html_url,
        merged_at_ms: parseIsoToMs(pr.merged_at),
        head_sha: pr.head?.sha || null
      }
    });
  }

  // Stable sort by created time (tie-break relies on submitted_at_ms)
  submissions.sort((a, b) => a.submitted_at_ms - b.submitted_at_ms || String(a.submission_id).localeCompare(String(b.submission_id)));

  // Write run-dir artifacts
  writeJson(path.join(outDir, 'deal.json'), deal);
  writeJson(path.join(outDir, 'submissions.json'), { deal_id: deal.deal_id, submissions });

  // state.json if missing
  const statePath = path.join(outDir, 'state.json');
  if (!fs.existsSync(statePath)) {
    writeJson(statePath, {
      deal_id: deal.deal_id,
      created_at_ms: deal.created_at_ms,
      evaluated_at_ms: null,
      released: false,
      released_at_ms: null,
      receipt: null
    });
  }

  appendAudit(outDir, 'GITHUB_INGEST', {
    repo: `${owner}/${name}`,
    issue: Number(issueNumber),
    merged_prs_found: items.length,
    submissions_written: submissions.length
  });

  console.log(JSON.stringify({ ok: true, out_dir: outDir, deal_id: deal.deal_id, submissions: submissions.length }, null, 2));
}

async function main() {
  const { cmd, args } = parseArgs(process.argv.slice(2));

  try {
    if (!cmd || cmd === 'help') {
      console.log(`GitHub Ingest (v1)\n\nUsage:\n  node github-ingest.mjs ingest --repo owner/name --issue 123 --out runs/deal-issue-123\n\nEnv:\n  GITHUB_TOKEN (recommended)\n`);
      process.exit(0);
    }

    if (cmd === 'ingest') {
      const repo = requireArg(args, 'repo');
      const issue = Number(requireArg(args, 'issue'));
      const out = requireArg(args, 'out');
      if (!Number.isFinite(issue) || issue <= 0) throw new Error('Bad --issue value');
      await ingest({ repo, issueNumber: issue, outDir: out });
      return;
    }

    throw new Error(`Unknown command: ${cmd}`);
  } catch (e) {
    console.error(String(e?.stack ?? e?.message ?? e));
    process.exit(1);
  }
}

await main();
