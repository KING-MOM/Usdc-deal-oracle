#!/usr/bin/env node
/**
 * Moltbook #DEAL listener (MVP)
 *
 * Polls m/usdc feed, finds posts containing #DEAL, parses a strict template,
 * creates a local deal in deals.json, and publicly comments with the deal_id.
 *
 * This variant supports "winner provides payout address in submission".
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { getSubmoltFeed, commentOnPost } from './moltbook.mjs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const STATE_FILE = path.join(__dirname, 'listener-state.json');
const DEALS_FILE = path.join(__dirname, 'deals.json');

function nowMs() { return Date.now(); }
function id(prefix) {
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${Date.now()}-${rand}`;
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function parseDealFromText(text) {
  if (!text || !text.includes('#DEAL')) return null;

  const lines = text.split(/\r?\n/).map(l => l.trim());

  const map = {};
  let inRequirements = false;
  let inSubmission = false;
  const requirements = [];
  const submission_format = [];
  const descriptionLines = [];

  for (const line of lines) {
    if (!line) continue;

    if (line.toLowerCase() === 'requirements:') {
      inRequirements = true;
      inSubmission = false;
      continue;
    }
    if (line.toLowerCase() === 'submission_format:') {
      inSubmission = true;
      inRequirements = false;
      continue;
    }
    if (line.toLowerCase() === 'description:') {
      inSubmission = false;
      inRequirements = false;
      continue;
    }

    if (inRequirements) {
      if (line.startsWith('-')) requirements.push(line.replace(/^\-\s*/, ''));
      continue;
    }
    if (inSubmission) {
      if (line.startsWith('-')) submission_format.push(line.replace(/^\-\s*/, ''));
      continue;
    }

    const m = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (m) {
      map[m[1]] = m[2];
    } else {
      if (!line.startsWith('#')) descriptionLines.push(line);
    }
  }

  const amount = Number(map.amount_usdc);
  const challengeMinutes = Number(map.challenge_minutes ?? 60);
  const requireProofLinks = String(map.require_proof_links ?? 'true') === 'true';

  if (!Number.isFinite(amount) || amount <= 0) return null;

  const desc = map.description || (descriptionLines.length ? descriptionLines.join(' ') : '');

  return {
    amount,
    chain: map.chain ?? 'base-sepolia',
    challengeMinutes,
    requireProofLinks,
    description: desc,
    requirements,
    submission_format,
  };
}

function buildRequirementsText(parsed) {
  const reqLines = [];
  if (parsed.description) reqLines.push(`Description: ${parsed.description}`);
  if (parsed.requirements?.length) {
    reqLines.push('Requirements:');
    for (const r of parsed.requirements) reqLines.push(`- ${r}`);
  }
  if (parsed.submission_format?.length) {
    reqLines.push('Submission format:');
    for (const s of parsed.submission_format) reqLines.push(`- ${s}`);
  }
  // enforce winner-provides address
  reqLines.push('Payout address: must be provided by submitter as `payout_address: 0x...` in their submission.');
  return reqLines.join('\n');
}

async function runOnce() {
  const state = readJson(STATE_FILE, { lastSeenPostId: null, processed: {} });
  const deals = readJson(DEALS_FILE, {});

  const feed = await getSubmoltFeed({ submolt: 'usdc', sort: 'new', limit: 25 });
  const list = Array.isArray(feed?.posts) ? feed.posts : [];

  for (const post of list) {
    const postId = post.id || post.post_id;
    if (!postId) continue;

    if (state.lastSeenPostId && postId === state.lastSeenPostId) break;
    if (state.processed[postId]) continue;

    const content = post.content || post.body || '';
    const title = post.title || '';

    const parsed = parseDealFromText(content);
    if (!parsed) {
      state.processed[postId] = { skipped: true, at: nowMs() };
      continue;
    }

    const dealId = id('deal');
    const challengeMs = parsed.challengeMinutes * 60 * 1000;

    deals[dealId] = {
      deal_id: dealId,
      source: 'moltbook',
      source_post_id: postId,
      title: title || 'Untitled Deal',
      status: 'OPEN',
      amount: parsed.amount,
      requirements: buildRequirementsText(parsed),
      created_at: nowMs(),
      challenge_until: nowMs() + challengeMs,
      requireProofLinks: parsed.requireProofLinks,
      submissions: [],
      winner_submission_id: null,
      circle_tx_id: null
    };

    writeJson(DEALS_FILE, deals);

    const reply = [
      '#USDCHackathon DealOracle',
      '',
      `Deal registered: \`${dealId}\``,
      `Challenge window ends: ${new Date(deals[dealId].challenge_until).toISOString()}`,
      '',
      'To submit, reply with:',
      '#SUBMISSION',
      '...your submission...',
      'payout_address: 0xYOUR_EVM_ADDRESS',
      'proof_links: url1, url2'
    ].join('\n');

    await commentOnPost({ postId, content: reply });

    state.processed[postId] = { dealId, at: nowMs() };
  }

  const newest = list[0]?.id || list[0]?.post_id;
  if (newest) state.lastSeenPostId = newest;
  writeJson(STATE_FILE, state);
}

async function main() {
  const mode = process.argv[2] || 'once';
  if (mode === 'once') {
    await runOnce();
    console.log('ok');
    return;
  }
  if (mode === 'follow') {
    const everyMs = Number(process.argv[3] || 20000);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await runOnce();
      } catch (e) {
        console.error(`listener error: ${e?.message ?? e}`);
      }
      await new Promise(r => setTimeout(r, everyMs));
    }
  }
  throw new Error('Usage: node listener.mjs once|follow [ms]');
}

await main();
