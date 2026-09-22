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

## CodeQL baseline remediation (September 2026)

The 90 initial alerts were reviewed by source and grouped by shared cause. The changes replace predictable temporary writes with exclusive, randomly named files; stop stealing live locks by age; use descriptor-based file reads and exclusive new-file creation; and constrain static reads to the resolved serving root. Cache lock timeout now fails instead of updating without a lock. A crashed tips-hook lock requires inspecting the owner and removing the abandoned lock before retrying.

HTML extraction uses tokenized text processing and one-pass entity decoding. Markdown exports escape literal HTML and Markdown metacharacters, reject executable URL schemes, and preserve ordinary headings, links, lists and code blocks. YAML metadata remains a quoted scalar even when it contains newlines, quotes or backslashes. BibTeX escaping is single-pass. URL strategy selection matches parsed hostnames; expensive delimiter regexes were replaced with direct scanning.

New files and atomic replacements use owner-only permissions. Session and clipboard file reads reject final symbolic links and non-regular files; static reads permit links only when their resolved targets stay within the serving root. These are intentional behavior changes. Shared directories and concurrent replacement of parent directories remain a host trust boundary. Atomic replacement does not serialize every read/modify/write operation. Custom endpoints remain trusted configuration, and the bundled integrity manifest remains unsigned.

Regression tests cover temporary-file symlinks, failed replacement cleanup, lock timeout, static-root escapes, file limits, hostile export metadata, safe Markdown destinations, and entity/BibTeX correctness. Test-only JavaScript literals passed directly to Node and timestamp fixtures inside private temporary directories are reviewed separately from shipped runtime findings. No scanning rule or source directory is excluded to reduce the alert count.
