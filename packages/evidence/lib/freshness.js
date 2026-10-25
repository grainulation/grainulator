/**
 * freshness — is a compilation still current for its sprint?
 *
 * Shared by the output guard and status. A compilation is fresh when it was
 * made by this compiler version, the claims hash matches claims.json, and the
 * passage fingerprint matches the referenced passages as they are on disk now
 * (by content hash where they can be read, else by failure code). Freshness is current-state
 * equivalence: restoring the exact original bytes of an edited passage makes
 * the compilation fresh again; detecting that an edit happened in between
 * would need a persistent history.
 *
 * Zero npm dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import {
	COMPILER_VERSION,
	generateCertificate,
	passagesFingerprint,
} from "../compiler/wheat-compiler.js";

/**
 * @param {string} claimsPath path to claims.json
 * @param {object} compilation parsed compilation.json
 * @returns {{ fresh: boolean, reason: string }}
 */
export function compilationFreshness(claimsPath, compilation) {
	const claimsData = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
	const certificate = compilation?.compilation_certificate;
	if (certificate?.compiler_version !== COMPILER_VERSION)
		return { fresh: false, reason: "compiler_changed" };
	if (certificate?.input_hash !== generateCertificate(claimsData).input_hash)
		return { fresh: false, reason: "claims_changed" };
	const current = passagesFingerprint(
		claimsData,
		path.dirname(path.resolve(claimsPath)),
	);
	// A certificate without a passage fingerprint is current only if the
	// ledger references no passages.
	const recorded =
		certificate.passages_hash ?? passagesFingerprint({ claims: [] }, ".");
	if (recorded !== current)
		return { fresh: false, reason: "passages_changed" };
	return { fresh: true, reason: "ok" };
}
