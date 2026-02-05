#!/usr/bin/env node

const required = ['CIRCLE_API_KEY', 'CIRCLE_ENTITY_SECRET', 'ESCROW_WALLET_ID'];
const optional = ['ORACLE_LLM_API_KEY', 'ORACLE_ALLOW_DETERMINISTIC_ACCEPT', 'MOLTBOOK_API_KEY'];

console.log('Checking env…\n');

let missing = [];
for (const k of required) {
  if (!process.env[k]) {
    console.log(`❌ ${k} (required) is missing`);
    missing.push(k);
  } else {
    console.log(`✅ ${k} is set`);
  }
}

for (const k of optional) {
  if (!process.env[k]) {
    console.log(`⚠️  ${k} not set (optional)`);
  } else {
    console.log(`✅ ${k} is set`);
  }
}

if (missing.length) {
  console.log(`\nFix: export the missing vars in your shell (see README.md).`);
  process.exit(1);
}

console.log('\n✅ All required env vars are set.');
