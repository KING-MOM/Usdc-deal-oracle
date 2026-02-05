// transfer.ts
import 'dotenv/config';
import {
  initiateDeveloperControlledWalletsClient
} from '@circle-fin/developer-controlled-wallets';

// Initialize the client
const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const WALLET_A_ID = process.env.WALLET_A_ID!;
const WALLET_B_ADDRESS = process.env.WALLET_B_ADDRESS!;

const response = await client.getWalletTokenBalance({
  id: WALLET_A_ID,
});

console.log('Token balances:', response.data?.tokenBalances);

// Create the transfer
// Note: USDC has 6 decimals, amount is in decimal format (e.g., "1" = 1 USDC)
const transfer = await client.createTransaction({
  walletId: WALLET_A_ID,
  destinationAddress: WALLET_B_ADDRESS,
  tokenId: response.data?.tokenBalances?.[0]?.token?.id!,
  amount: ['1'], // Transfer 1 USDC
  fee: {
    type: 'level',
    config: {
      feeLevel: 'MEDIUM',
    },
  },
});

console.log('Transfer initiated:', transfer.data?.id);

// Monitor transaction status
let state = 'INITIATED';
let txHash = '';

while (state !== 'CONFIRMED') {
  const { data } = await client.getTransaction({ id: transfer.data?.id! });
  state = data?.transaction?.state!;
  txHash = data?.transaction?.txHash!;

  if (state !== 'CONFIRMED') {
    console.log('Waiting for confirmation... Current state:', state);
    await new Promise(r => setTimeout(r, 2000));
  }
}

console.log('✅ Transfer confirmed');
console.log('Tx Hash:', txHash);