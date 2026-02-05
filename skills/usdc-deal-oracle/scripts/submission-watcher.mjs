#!/usr/bin/env node
/**
 * Submission watcher
 *
 * Polls comments on a specific Moltbook post, detects #SUBMISSION replies,
 * and appends them as submissions to the corresponding local deal.
 *
 * Usage:
 *   node submission-watcher.mjs once --postId <POST_ID>
 *   node submission-watcher.mjs follow --postId <POST_ID> [--everyMs 20000]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { getPostComments } from './moltbook.mjs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DEALS_FILE = path.join(__dirname, 'deals.json');
const STATE_FILE = path.join(__dirname, 'submission-watcher-state.json');

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

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      out[t.slice(2)] = argv[i + 1];
      i++;
    } else {
      out._.push(t);
    }
  }
  return out;
}

function extractPayoutAddress(text) {
  if (!text) return null;
  const m = text.match(/payout_address\s*:\s*(0x[a-fA-F0-9]{40})/i);
  if (m) return m[1];
  return null;
}

function extractProofLinks(text) {
  if (!text) return [];
  const m = text.match(/proof_links\s*:\s*(.+)$/im);
  if (!m) return [];
  return m[1].split(',').map(s => s.trim()).filter(Boolean);
}

function isSubmission(text) {
  if (!text) return false;
  return text.trim().startsWith('#SUBMISSION');
}

function normalizeCommentsPayload(payload) {
  // Moltbook docs show: GET /posts/:id/comments returns {success, comments:[...]}
  if (Array.isArray(payload?.comments)) return payload.comments;
  if (Array.isArray(payload?.data?.comments)) return payload.data.comments;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function ingestOnce(postId) {
  if (!fs.existsSync(DEALS_FILE)) throw new Error('deals.json not found yet');

  const deals = readJson(DEALS_FILE, {});
  const deal = Object.values(deals).find(d => d.source === 'moltbook' && d.source_post_id === postId);
  if (!deal) throw new Error(`No deal found for postId=${postId}`);
  if (!Array.isArray(deal.submissions)) deal.submissions = [];

  const state = readJson(STATE_FILE, { processedCommentIds: {} });

  const payload = await getPostComments({ postId, sort: 'new', limit: 50 });
  const comments = normalizeCommentsPayload(payload);

  let added = 0;

  for (const c of comments) {
    const commentId = c.id || c.comment_id;
    const content = c.content || c.body || '';
    if (!commentId) continue;
    if (state.processedCommentIds[commentId]) continue;

    // mark as seen regardless to avoid loops
    state.processedCommentIds[commentId] = { seen_at: nowMs(), type: 'other' };

    if (!isSubmission(content)) continue;

    const payout = extractPayoutAddress(content);
    const proofLinks = extractProofLinks(content);

    if (!payout) {
      state.processedCommentIds[commentId] = { seen_at: nowMs(), type: 'submission_rejected', reason: 'missing_payout_address' };
      continue;
    }

    const submissionId = id('sub');
    deal.submissions.push({
      submission_id: submissionId,
      source: 'moltbook_comment',
      source_comment_id: commentId,
      submitted_at: nowMs(),
      payout_address: payout,
      submission_text: content,
      proof_links: proofLinks,
      evaluation: null
    });
    added++;

    state.processedCommentIds[commentId] = { seen_at: nowMs(), type: 'submission_added', submission_id: submissionId };
  }

  deal.updated_at = nowMs();
  // keep status at least SUBMITTED if any submission exists
  if (deal.submissions.length > 0 && (deal.status === 'OPEN' || !deal.status)) deal.status = 'SUBMITTED';

  // write back
  // find key by deal_id
  deals[deal.deal_id] = deal;
  writeJson(DEALS_FILE, deals);
  writeJson(STATE_FILE, state);

  return { ok: true, postId, dealId: deal.deal_id, added, totalComments: comments.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args._[0] || 'once';
  const postId = args.postId;
  if (!postId) throw new Error('Missing --postId');

  if (mode === 'once') {
    const res = await ingestOnce(postId);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (mode === 'follow') {
    const everyMs = Number(args.everyMs || 20000);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await ingestOnce(postId);
        if (res.added) console.log(JSON.stringify(res, null, 2));
      } catch (e) {
        console.error(`watcher error: ${e?.message ?? e}`);
      }
      await new Promise(r => setTimeout(r, everyMs));
    }
  }

  throw new Error('Usage: node submission-watcher.mjs once|follow --postId <id> [--everyMs 20000]');
}

await main();
