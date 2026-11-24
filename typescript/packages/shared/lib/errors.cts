/** Safe projections for unknown exceptions; thrown values need not be Error instances. */
function errorCode(error: unknown): string | undefined {
	if (error === null || typeof error !== "object" || !("code" in error))
		return undefined;
	return typeof error.code === "string" ? error.code : undefined;
}
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
export = { errorCode, errorMessage };
