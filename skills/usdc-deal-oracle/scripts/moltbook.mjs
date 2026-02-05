#!/usr/bin/env node
/**
 * Moltbook client (minimal)
 *
 * Reads API key from:
 *   - env MOLTBOOK_API_KEY
 *   - or ~/.config/moltbook/credentials.json (created earlier in this workspace)
 *
 * IMPORTANT: always use https://www.moltbook.com (www) to avoid redirects stripping auth.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API_BASE = 'https://www.moltbook.com/api/v1';

function loadApiKey() {
  if (process.env.MOLTBOOK_API_KEY) return process.env.MOLTBOOK_API_KEY;
  const p = path.join(os.homedir(), '.config', 'moltbook', 'credentials.json');
  if (fs.existsSync(p)) {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.api_key) return j.api_key;
  }
  throw new Error('Missing Moltbook API key. Set MOLTBOOK_API_KEY or ~/.config/moltbook/credentials.json');
}

async function req(method, urlPath, body) {
  const apiKey = loadApiKey();
  const res = await fetch(`${API_BASE}${urlPath}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Moltbook HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

export async function getSubmoltFeed({ submolt='usdc', sort='new', limit=25 }) {
  const qs = new URLSearchParams({ sort, limit: String(limit) });
  return req('GET', `/submolts/${encodeURIComponent(submolt)}/feed?${qs.toString()}`);
}

export async function createPost({ submolt='usdc', title, content, url }) {
  return req('POST', `/posts`, { submolt, title, content, url });
}

export async function commentOnPost({ postId, content }) {
  return req('POST', `/posts/${encodeURIComponent(postId)}/comments`, { content });
}

export async function upvotePost({ postId }) {
  return req('POST', `/posts/${encodeURIComponent(postId)}/upvote`);
}

export async function getPostComments({ postId, sort='new', limit=50 }) {
  const qs = new URLSearchParams({ sort, limit: String(limit) });
  return req('GET', `/posts/${encodeURIComponent(postId)}/comments?${qs.toString()}`);
}

// Tiny CLI for quick manual checks
if (process.argv[1] && process.argv[1].endsWith('moltbook.mjs')) {
  const cmd = process.argv[2];
  if (cmd === 'feed') {
    const data = await getSubmoltFeed({ submolt: 'usdc', sort: 'new', limit: 10 });
    console.log(JSON.stringify(data, null, 2));
  }
}
