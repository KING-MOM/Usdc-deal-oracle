#!/usr/bin/env node
/**
 * Create a DCW wallet (escrow) on a given blockchain.
 * Usage:
 *   node circle-create-wallet.mjs --blockchain BASE-SEPOLIA --name usdc-oracle
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
  const blockchain = args.blockchain || 'BASE-SEPOLIA';
  const name = args.name || `usdc-oracle-${blockchain.toLowerCase()}`;

  const client = initiateDeveloperControlledWalletsClient({
    apiKey: requireEnv('CIRCLE_API_KEY'),
    entitySecret: requireEnv('CIRCLE_ENTITY_SECRET'),
  });

  const ws = await client.createWalletSet({ name });
  const walletSetId = ws?.data?.walletSet?.id;
  if (!walletSetId) throw new Error('Failed to create wallet set (no id).');

  const wallets = await client.createWallets({
    blockchains: [blockchain],
    count: 1,
    walletSetId,
  });

  const w = wallets?.data?.wallets?.[0];
  console.log(JSON.stringify({
    walletSetId,
    wallet: w,
  }, null, 2));
}

main().catch((e) => {
  console.error(`create wallet failed: ${e?.message ?? e}`);
  process.exit(1);
});
