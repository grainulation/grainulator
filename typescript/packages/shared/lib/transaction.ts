import fs from "node:fs";
import path from "node:path";
import errors from "./errors.cjs";

/** Serialize cooperating local processes around the entire read/modify/write operation.
 * A crashed writer leaves its lock for explicit recovery; age alone never authorizes
 * stealing a lock. This is a local-filesystem protocol, not a distributed lock.
 */
export function withFileTransaction<T>(
	file: string,
	operation: () => T,
	{ timeoutMs = 5000 } = {},
): T {
	const target = path.join(
		fs.realpathSync(path.dirname(file)),
		path.basename(file),
	);
	const lock = `${target}.lock`;
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			fs.mkdirSync(lock, { mode: 0o700 });
			break;
		} catch (error) {
			if (errors.errorCode(error) !== "EEXIST") throw error;
			if (Date.now() >= deadline) {
				const busy = Object.assign(
					new Error(
						`Ledger is busy: ${lock}. Retry; if its writer crashed, inspect owner.json before removing the lock.`,
					),
					{ code: "E_LEDGER_BUSY" },
				);
				throw busy;
			}
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
		}
	}
	try {
		fs.writeFileSync(
			path.join(lock, "owner.json"),
			JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
			{ flag: "wx", mode: 0o600 },
		);
		return operation();
	} finally {
		fs.rmSync(lock, { recursive: true, force: true });
	}
}
