#!/usr/bin/env node
/**
 * Circle smoke test (read-only-ish)
 *
 * Purpose: verify credentials for @circle-fin/developer-controlled-wallets.
 * This SHOULD NOT send funds.
 */

import process from 'node:process';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  const apiKey = requireEnv('CIRCLE_API_KEY');
  const entitySecret = requireEnv('CIRCLE_ENTITY_SECRET');

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  // Try a benign endpoint; if shapes differ, we’ll adjust.
  // Many SDKs support "listWallets" or "getWallet"; we probe a couple.

  if (typeof client.listWallets === 'function') {
    const res = await client.listWallets({ pageSize: 1 });
    console.log(JSON.stringify({ ok: true, method: 'listWallets', sample: res?.data ?? res }, null, 2));
    return;
  }

  if (typeof client.getWallet === 'function') {
    const walletId = requireEnv('ESCROW_WALLET_ID');
    const res = await client.getWallet({ walletId });
    console.log(JSON.stringify({ ok: true, method: 'getWallet', sample: res?.data ?? res }, null, 2));
    return;
  }

  console.log(JSON.stringify({ ok: false, hint: 'SDK method names differ; inspect client keys and adapt.' }, null, 2));
  console.log(Object.keys(client).slice(0, 50));
}

main().catch((e) => {
  console.error(`circle smoke failed: ${e?.message ?? e}`);
  process.exit(1);
});
