// wallet-demo.ts
import 'dotenv/config';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

console.log('SDK initialised ✓');

const walletSet = await client.createWalletSet({
    name: 'demo-wallet-set',
});

const wallets = await client.createWallets({
    blockchains: ['ETH-SEPOLIA'],
    count: 2,
    walletSetId: walletSet.data?.walletSet?.id!,
});

const walletA = wallets.data?.wallets[0]!;
const walletB = wallets.data?.wallets[1]!;

console.log('Wallet A ID:', walletA.id);
console.log('Wallet A Address:', walletA.address);
console.log('Wallet B ID:', walletB.id);
console.log('Wallet B Address:', walletB.address);