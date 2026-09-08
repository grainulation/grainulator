# 2.0.2 focused security review

This patch follows the 2.0.1 installation review. A pre-mortem examined misleading integrity results, workspace escapes, local HTTP failures, unsafe file replacement, and credential-bearing diagnostics. The review used disposable fixtures and existing regression suites; it was not a penetration test or an independent certification.

## Confirmed defects addressed

| Area | Resulting behavior |
| --- | --- |
| Host wrapper diagnostics | Both `.mcp.json` and `mcp.json` can be verified after the supported host wrapper is applied. A changed configuration reference, server name, original executable, arguments or environment fails verification. |
| Export destinations | Protected plugin/configuration files cannot be overwritten through ordinary or hidden-alias MCP exports, direct CLI exports, or symbolic-link paths with missing children. |
| Implicit log reads | The synchronization log tool checks the resolved file stays in the configured workspace, matching resource-read protection. |
| Preview request parsing | Malformed request targets receive HTTP 400 and the server remains available. |
| Workspace saves | Exclusive temporary-file ownership prevents cleanup from deleting a pre-existing file when creation fails. Failed replacements preserve the prior configuration. |
| Runner diagnostics | Exact known environment credential values are redacted from returned results, stored traces and progress callbacks. Adapter/verifier operational input remains unchanged. |

## Existing controls checked

Focused tests exercise hostile Host/Origin values, the request-size cap and concurrency-slot release, authenticated provider redirects, provider error redaction, upstream cancellation and response-size limits. No additional provider changes were required by those checks. The dependency advisory check reported zero vulnerabilities at review time; that result is time-specific and does not establish source-code safety.

## Limits

The manifest is a bundled reproducibility record, not a cryptographic signature from an independent authority. Verification does not attest the host security wrapper executable. Application path checks are not an operating-system sandbox and do not protect against a separate process concurrently changing local filesystem objects.

Runner redaction recognizes credential-like environment names and exact values of at least eight characters. It does not discover arbitrary secrets, encoded/derived values, short values, or credentials under unrecognized names. Review generated artifacts before sharing them. Live-provider quality, independent citation support and cumulative spending limits remain separate product questions.

Existing host processes must restart to load a newly installed plugin. Release verification must identify the actual installed build; testing a checkout does not upgrade a cache.
