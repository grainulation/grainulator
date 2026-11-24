// Generated from typescript/packages/shared/lib/errors.cts; edit that source and run npm run build:types.
"use strict";
/** Safe projections for unknown exceptions; thrown values need not be Error instances. */
function errorCode(error) {
	if (error === null || typeof error !== "object" || !("code" in error))
		return undefined;
	return typeof error.code === "string" ? error.code : undefined;
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
module.exports = { errorCode, errorMessage };
