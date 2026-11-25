import type { TokenUsage } from "../contracts.mjs";

type UsageCall = { usage: TokenUsage | null; costUsd?: number | null };
export function usageTotals(calls: UsageCall[]) {
	const known = calls.every(
		(c) =>
			c.usage &&
			Number.isFinite(c.usage!.input_tokens) &&
			Number.isFinite(c.usage!.output_tokens),
	);
	return {
		calls: calls.length,
		inputTokens: known
			? calls.reduce(
					(n, c) =>
						n +
						c.usage!.input_tokens +
						(c.usage!.cache_read_input_tokens || 0) +
						(c.usage!.cache_creation_input_tokens || 0),
					0,
				)
			: null,
		outputTokens: known
			? calls.reduce((n, c) => n + c.usage!.output_tokens, 0)
			: null,
		reportedCostUsd: calls.every((c) => Number.isFinite(c.costUsd))
			? calls.reduce((n, c) => n + c.costUsd!, 0)
			: null,
	};
}
export function canStartCall(calls: UsageCall[], budget: number) {
	const u = usageTotals(calls);
	return (
		u.inputTokens !== null &&
		u.outputTokens !== null &&
		u.inputTokens + u.outputTokens < budget
	);
}
