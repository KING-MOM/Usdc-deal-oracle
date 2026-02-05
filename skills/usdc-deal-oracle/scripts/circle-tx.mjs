#!/usr/bin/env node
/**
 * Fetch Circle transaction details and print txHash + explorer link (Base Sepolia).
 * Usage: node circle-tx.mjs --txId <circle_tx_id>
 */

import process from 'node:process';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const txId = args.txId;
  if (!txId) throw new Error('Missing --txId');

  const client = initiateDeveloperControlledWalletsClient({
    apiKey: requireEnv('CIRCLE_API_KEY'),
    entitySecret: requireEnv('CIRCLE_ENTITY_SECRET')
  });

  const res = await client.getTransaction({ id: txId });
  const tx = res?.data?.transaction || res?.data || res?.transaction;

  const state = tx?.state;
  const txHash = tx?.txHash;
  const blockchain = tx?.blockchain;

  const baseSepoliaExplorer = txHash ? `https://sepolia.basescan.org/tx/${txHash}` : null;

  console.log(JSON.stringify({
    tx_id: txId,
    state,
    blockchain,
    txHash,
    explorer: baseSepoliaExplorer,
    raw: tx
  }, null, 2));
}

main().catch((e) => {
  console.error(`circle tx fetch failed: ${e?.message ?? e}`);
  process.exit(1);
});
