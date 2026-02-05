#!/usr/bin/env node
/**
 * Circle balance check (DCW)
 * Prints token balances for ESCROW_WALLET_ID.
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
  const walletId = requireEnv('ESCROW_WALLET_ID');

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  const res = await client.getWalletTokenBalance({ id: walletId });
  const balances = res?.data?.tokenBalances ?? [];

  console.log('=== TOKEN BALANCES ===');
  for (const b of balances) {
    const token = b.token || {};
    console.log(`${token.symbol || '???'}\t${b.amount}\t(decimals=${token.decimals})\t${token.tokenAddress || 'native'}`);
  }
}

main().catch((e) => {
  console.error(`balance check failed: ${e?.message ?? e}`);
  process.exit(1);
});
