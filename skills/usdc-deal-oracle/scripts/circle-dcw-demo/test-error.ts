import 'dotenv/config';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const WALLET_A_ID = process.env.WALLET_A_ID!;
const WALLET_B_ADDRESS = process.env.WALLET_B_ADDRESS!;

try {
  const response = await client.getWalletTokenBalance({
    id: WALLET_A_ID,
  });

  console.log('Token balances:', response.data?.tokenBalances);

  const transfer = await client.createTransaction({
    walletId: WALLET_A_ID,
    destinationAddress: WALLET_B_ADDRESS,
    tokenId: response.data?.tokenBalances?.[0]?.token?.id!,
    amount: ['0.001'],
    fee: {
      type: 'level',
      config: {
        feeLevel: 'MEDIUM',
      },
    },
  });

  console.log('SUCCESS - Transfer created:', transfer.data?.id);
} catch (error: any) {
  console.error('\n=== ERROR DETAILS ===');
  console.error('Status:', error.response?.status);
  console.error('Status Text:', error.response?.statusText);
  console.error('Error Message:', error.response?.data?.message || error.message);
  console.error('Error Code:', error.response?.data?.code);
  console.error('\nFull Response Data:');
  console.error(JSON.stringify(error.response?.data, null, 2));
}
