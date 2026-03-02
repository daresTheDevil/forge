# Forge Secure — Coming in Phase 2

This command is planned for Phase 2 (Compliance Layer).

When implemented, `/forge:secure` will:
- Spawn the `forge-security` agent to perform a full security audit
- Scan for: code vulnerabilities, dependency audit (npm audit / cargo audit / pip-audit),
  secrets scan (hardcoded credentials, API keys, connection strings in code),
  and infrastructure review (exposed ports, insecure configs in k8s/Docker)
- Write findings to `.forge/compliance/security-audits/[YYYY-MM-DD].md`
- Distinguish findings by severity: CRITICAL, HIGH, MEDIUM, LOW, INFO
- Generate a prioritized remediation list

This audit also runs automatically as part of every `/forge:build` cycle
(before the PR is opened).

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
