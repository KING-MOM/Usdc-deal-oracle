#!/usr/bin/env node
/**
 * Check native ETH balance for the escrow wallet via Circle DCW.
 */

import process from 'node:process';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: requireEnv('CIRCLE_API_KEY'),
    entitySecret: requireEnv('CIRCLE_ENTITY_SECRET')
  });

  const walletId = requireEnv('ESCROW_WALLET_ID');
  const res = await client.getWalletTokenBalance({ id: walletId });
  const bals = res?.data?.tokenBalances ?? [];
  const native = bals.find(b => b?.token?.isNative);

  if (!native) {
    console.log('No native token balance found (ETH).');
    console.log(JSON.stringify(bals.map(b => ({ symbol: b?.token?.symbol, amount: b?.amount, isNative: b?.token?.isNative })), null, 2));
    return;
  }

  console.log(`Native ${native.token.symbol || 'ETH'} balance: ${native.amount} (decimals=${native.token.decimals})`);
}

main().catch((e) => {
  console.error(`eth balance check failed: ${e?.message ?? e}`);
  process.exit(1);
});
