#!/usr/bin/env node
/**
 * Print a judge-friendly summary block for a deal.
 *
 * Usage:
 *   node summary-block.mjs --dealId <deal-...>
 *   node summary-block.mjs --dealId <deal-...> --postUrl <https://...>
 *
 * If Circle creds are available (CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET),
 * it will resolve txHash + BaseScan explorer link from circle_tx_id.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DEALS_FILE = path.join(__dirname, 'deals.json');

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

function readDeals() {
  if (!fs.existsSync(DEALS_FILE)) return {};
  const raw = fs.readFileSync(DEALS_FILE, 'utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function resolveCircleTx(circleTxId) {
  if (!circleTxId) return null;
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) return null;

  const client = initiateDeveloperControlledWalletsClient({
    apiKey: requireEnv('CIRCLE_API_KEY'),
    entitySecret: requireEnv('CIRCLE_ENTITY_SECRET')
  });

  const res = await client.getTransaction({ id: circleTxId });
  const tx = res?.data?.transaction || res?.data || res?.transaction;

  const txHash = tx?.txHash || null;
  const blockchain = tx?.blockchain || null;
  const state = tx?.state || null;

  const explorer = txHash ? `https://sepolia.basescan.org/tx/${txHash}` : null;

  return { txHash, blockchain, state, explorer };
}

function pickWinner(deal) {
  if (!deal?.submissions?.length) return null;
  const winnerId = deal.winner_submission_id;
  if (winnerId) return deal.submissions.find(s => s.submission_id === winnerId) || null;

  // fallback: best evaluated score
  let best = null;
  for (const s of deal.submissions) {
    const score = s?.evaluation?.score;
    if (typeof score !== 'number') continue;
    if (!best || score > (best?.evaluation?.score ?? -1)) best = s;
  }
  return best;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dealId = args.dealId;
  const postUrl = args.postUrl;

  if (!dealId) throw new Error('Missing --dealId');

  const deals = readDeals();
  const deal = deals[dealId];
  if (!deal) throw new Error(`Deal not found: ${dealId}`);

  const winner = pickWinner(deal);
  const score = winner?.evaluation?.score;
  const payout = winner?.payout_address || null;

  const circleTxId = deal.circle_tx_id;
  const circle = await resolveCircleTx(circleTxId).catch(() => null);

  const lines = [];
  lines.push('USDC Deal Oracle — Live Autopay Proof');
  lines.push('');
  if (postUrl) lines.push(`Deal post: ${postUrl}`);
  lines.push(`deal_id: ${dealId}`);
  lines.push(`network: Base Sepolia`);
  lines.push(`amount: ${deal.amount} USDC`);
  if (typeof score === 'number') lines.push(`winner_score: ${score}`);
  if (payout) lines.push(`payout_address: ${payout}`);
  if (circleTxId) lines.push(`circle_tx_id: ${circleTxId}`);
  if (circle?.txHash) lines.push(`tx_hash: ${circle.txHash}`);
  if (circle?.explorer) lines.push(`receipt: ${circle.explorer}`);

  // Print as a copy/paste block
  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((e) => {
  process.stderr.write((e?.message ?? String(e)) + '\n');
  process.exit(1);
});
