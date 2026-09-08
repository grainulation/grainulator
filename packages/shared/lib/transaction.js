import fs from 'node:fs';
import path from 'node:path';

/** Serialize cooperating local processes around the entire read/modify/write operation.
 * A crashed writer leaves its lock for explicit recovery; age alone never authorizes
 * stealing a lock. This is a local-filesystem protocol, not a distributed lock.
 */
export function withFileTransaction(file, operation, { timeoutMs = 5000 } = {}) {
  const target = path.join(fs.realpathSync(path.dirname(file)), path.basename(file));
  const lock = `${target}.lock`;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { fs.mkdirSync(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) {
        const busy = new Error(`Ledger is busy: ${lock}. Retry; if its writer crashed, inspect owner.json before removing the lock.`);
        busy.code = 'E_LEDGER_BUSY';
        throw busy;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    return operation();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}
