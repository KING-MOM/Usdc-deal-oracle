import 'dotenv/config';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const WALLET_A_ID = process.env.WALLET_A_ID!;

const wallet = await client.getWallet({ id: WALLET_A_ID });

console.log('=== WALLET A (Sender) ===');
console.log('Address:', wallet.data?.wallet?.address);
console.log('\n📋 Copy this address and use it at a Sepolia faucet to get test ETH');
console.log('Recommended faucets:');
console.log('  - https://sepoliafaucet.com');
console.log('  - https://www.alchemy.com/faucets/ethereum-sepolia');
