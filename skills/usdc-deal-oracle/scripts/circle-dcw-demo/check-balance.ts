import 'dotenv/config';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const WALLET_A_ID = process.env.WALLET_A_ID!;

const response = await client.getWalletTokenBalance({
  id: WALLET_A_ID,
});

console.log('=== ALL TOKEN BALANCES ===\n');
response.data?.tokenBalances?.forEach((balance) => {
  console.log(`Token: ${balance.token.symbol} (${balance.token.name})`);
  console.log(`  Amount: ${balance.amount}`);
  console.log(`  Decimals: ${balance.token.decimals}`);
  console.log(`  Is Native: ${balance.token.isNative}`);
  console.log(`  Address: ${balance.token.tokenAddress || 'N/A (native token)'}`);
  console.log('');
});
