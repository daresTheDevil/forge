# Forge Secure Workflow

Run a security audit on the current project and write a NIGC-compliant findings report.

This workflow is invoked by `/forge:secure`.

## Step 1: Locate the project

Read `.forge/state.json` to determine:
- The project root (current working directory)
- The active Change Request ID: `cr_id` field (if any)
- The current phase: `phase` field

Read `.forge/config.json` for any project-specific scan configuration.

## Step 2: Announce scope

Tell the user:
```
SECURITY AUDIT
══════════════════════════════════════════════════
Scanning: [project root]
Change Request: [CR-ID or "standalone"]

Checks:
  ✓ Code — OWASP top 10, injection vectors, insecure patterns
  ✓ Secrets — hardcoded credentials, API keys, connection strings
  ✓ Dependencies — pnpm audit (known CVEs)
  ✓ Infrastructure — Docker/k8s misconfigurations
══════════════════════════════════════════════════
```

## Step 3: Spawn the forge-security agent

Spawn a `forge-security` subagent. Pass:
- Project root
- Active CR ID (if any)
- Scope: full scan

Tell the agent to write its structured findings list to `.forge/compliance/security-audits/[date]-findings.json`
so this workflow can read them.

Wait for the agent to complete.

## Step 4: Read agent findings

Read `.forge/compliance/security-audits/[date]-findings.json`.

The findings are a JSON array where each entry has:
```json
{
  "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
  "category": "string",
  "title": "string",
  "description": "string",
  "file": "optional path",
  "line": "optional line number",
  "recommendation": "string"
}
```

## Step 5: Write the security audit document

Call `mcp__forge-tools__compliance_write_security_audit` with:
- `projectRoot`: current working directory
- `crId`: active CR ID or omit
- `findings`: the array from the agent

## Step 6: Append to audit trail

Call `mcp__forge-tools__compliance_append_audit_trail` with:
- `projectRoot`: current working directory
- `entries`:
  ```json
  [{ "action": "security:audit-complete", "actor": "forge-security", "reference": "[CR-ID or 'standalone']" }]
  ```

## Step 7: Update state

Update `.forge/state.json`: set `last_action` to `"security audit complete — [N] CRITICAL, [N] HIGH, [N] MEDIUM findings"`,
set `next_action` to `"[if CRITICAL: 'resolve CRITICAL findings before release' | else: 'run /forge:release when ready']"`,
set `updated_at` to `"[ISO timestamp]"`.

## Step 8: Display results and verdict

Display the full findings summary:

```
SECURITY AUDIT COMPLETE
══════════════════════════════════════════════════
Report: .forge/compliance/security-audits/[filename]

Findings:
  [N] CRITICAL  ← must resolve before release
  [N] HIGH
  [N] MEDIUM
  [N] LOW
  [N] INFO

[If CRITICAL > 0:]
  RELEASE BLOCKED — [N] critical findings must be resolved.
  Fix the issues above and run /forge:secure again to clear the block.

[If CRITICAL == 0:]
  Release not blocked. Proceed with /forge:release when ready.
══════════════════════════════════════════════════
```

List all CRITICAL and HIGH findings with file/line references.
