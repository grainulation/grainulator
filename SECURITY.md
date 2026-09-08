# Security Policy

## Supported versions

Only the latest published minor version of each package receives security
fixes. Older versions may be patched at maintainer discretion.

| Version | Supported |
| ------- | --------- |
| latest  | ✅         |
| older   | ❌         |

## Reporting a vulnerability

If you believe you have found a security vulnerability in this package,
please report it privately so we can fix it before it is disclosed.

Preferred: open a **Private vulnerability report** via GitHub Security
Advisories on this repository (`Security` tab → `Report a vulnerability`).
GitHub handles coordination and gives us a private space to discuss a fix.

Alternative: email `security@grainulator.app` with a description of the
issue, reproduction steps, and relevant redacted logs. Do not include live credentials.

## Disclosure process

1. You report the issue privately.
2. We acknowledge receipt within **3 business days**.
3. We investigate, confirm (or refute) the issue, and develop a fix.
4. We coordinate a release date with you. Our default is a **90-day**
   disclosure window from initial report; we may ship a fix earlier
   and request that you delay public disclosure until users have had
   reasonable time to upgrade.
5. On the agreed disclosure date we publish a security advisory with
   credit to the reporter (unless you prefer to remain anonymous).

## Scope

In scope:

- Remote code execution via crafted input to any CLI, MCP tool, or
  exported library function.
- Path traversal, command injection, or SSRF in features that read
  files, spawn processes, or fetch URLs.
- Leakage of user secrets (tokens, environment variables) written to
  logs, outputs, or disk caches.
- Anything that would let a malicious claim / sprint / configuration
  compromise the developer machine running the tool.

Out of scope:

- Issues that require the attacker to already have local filesystem
  access or to have modified package files directly.
- Denial of service via obviously expensive inputs (please do file
  performance issues on the public tracker).
- Missing security headers on local-only HTTP servers that are
  intended for a single-user loopback workflow.

## Credit

We credit reporters in release notes and the advisory. Let us know if
you'd prefer to remain anonymous.


## Local trust boundaries

Grainulator runs with the permissions of its host process. MCP workspace containment and protected export paths are application checks, not an operating-system sandbox. Do not treat them as protection against another process that can concurrently replace local files or symbolic links.

`doctor` compares package files with the bundled integrity manifest and recognizes only the supported security wrapper when its configuration, server, original command, arguments and environment match. The manifest is a reproducibility check, not a signed attestation or verification of the security wrapper executable itself. Keep host security controls enabled.

Provider keys stay local and are excluded from session exports. Runner diagnostics redact known credential values from the process environment, but this does not prove arbitrary model or adapter output contains no sensitive information. Review artifacts before sharing them.
