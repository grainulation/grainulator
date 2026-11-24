// Generated from typescript/packages/shared/lib/observe-command.ts; edit that source and run npm run build:types.
import { spawn } from "node:child_process";
import errors from "./errors.cjs";
/** Bounded local observation with process-group cleanup; never a shell or sandbox. */
export function observeCommand(argv, cwd, timeoutMs) {
	return new Promise((resolve) => {
		let failure = null;
		let total = 0;
		let killTimer;
		const stdout = [],
			stderr = [];
		const executable = argv[0];
		if (!executable) throw new Error("An observation command is required.");
		const child = spawn(executable, argv.slice(1), {
			cwd,
			shell: false,
			detached: process.platform !== "win32",
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		const kill = (signal) => {
			try {
				if (process.platform === "win32") child.kill(signal);
				else if (child.pid) process.kill(-child.pid, signal);
			} catch (error) {
				if (errors.errorCode(error) !== "ESRCH")
					failure ||= errors.errorCode(error) || "cleanup_failed";
			}
		};
		const stop = (why) => {
			failure ||= why;
			kill("SIGTERM");
			killTimer ??= setTimeout(() => kill("SIGKILL"), 300);
		};
		const interrupted = () => stop("interrupted");
		process.once("SIGINT", interrupted);
		process.once("SIGTERM", interrupted);
		const timer = setTimeout(() => stop("timeout"), timeoutMs);
		const collect = (target) => (chunk) => {
			const remaining = Math.max(0, 1024 * 1024 - total);
			if (remaining) target.push(chunk.subarray(0, remaining));
			total += chunk.length;
			if (total > 1024 * 1024) stop("output_limit");
		};
		child.stdout.on("data", collect(stdout));
		child.stderr.on("data", collect(stderr));
		child.on("error", (error) => {
			failure ||= errors.errorCode(error) || "spawn_failed";
		});
		child.on("close", (code, signal) => {
			clearTimeout(timer);
			clearTimeout(killTimer);
			// A successful leader must not leave detached group members running.
			kill("SIGKILL");
			process.removeListener("SIGINT", interrupted);
			process.removeListener("SIGTERM", interrupted);
			resolve({
				code,
				signal,
				failure,
				stdout: Buffer.concat(stdout),
				stderr: Buffer.concat(stderr),
			});
		});
	});
}
