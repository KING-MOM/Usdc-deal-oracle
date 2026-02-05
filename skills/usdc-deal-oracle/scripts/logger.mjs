import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const AUDIT_FILE = path.join(__dirname, 'audit.jsonl');

export function logAudit(action, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    action,
    ...data,
  };
  fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
  return entry;
}
