// register-secrets.ts
import dotenv from 'dotenv';
import fs from 'fs';
import { registerEntitySecretCiphertext } from '@circle-fin/developer-controlled-wallets';

dotenv.config();

(async () => {
  const apiKey = process.env.CIRCLE_API_KEY!;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET!;

  const response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: '',
  });

  fs.writeFileSync(
    'recovery_file.dat',
    response.data?.recoveryFile ?? '',
  );

  console.log('Entity Secret registered and recovery file saved ✅');
})();