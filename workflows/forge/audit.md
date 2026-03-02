# Forge Audit Workflow

Verify all requirements from the spec are implemented and produce a NIGC-formatted findings report.

This workflow is invoked by `/forge:audit`. Run it before `/forge:release` to confirm
every requirement has a passing test. Output is the artifact a CNGC auditor reads.

## Step 1: Load the spec

Read `.forge/state/current.md` for the active CR-ID and task slug.

Read the spec file: `.forge/specs/[task-slug]-SPEC.md`

Extract all requirements: every line matching `**REQ-NNN**` or `- REQ-NNN:` patterns.
For each requirement, extract:
- ID (REQ-NNN)
- Title/description

If no spec found:
```
No spec found for the current task.

Run /forge:spec to create a spec first,
or run /forge:plan and /forge:build to implement one.
```
Stop.

## Step 2: Map requirements to tests

For each REQ-NNN, search the test files (test/, __tests__/, *.test.ts, *.spec.ts) for
references to that requirement ID. A test file "covers" a requirement if it contains
the string `REQ-NNN` in a comment or test description.

Build a coverage map:
```
REQ-001 → test/auth.test.ts (line 42)
REQ-002 → NOT COVERED
REQ-003 → test/api.test.ts (line 15, line 67)
```

## Step 3: Run the tests

Run the project's test suite (scoped to files that cover the requirements):
```
pnpm test [test files that have REQ coverage]
```

Parse output to determine which tests passed/failed.

For tests that don't run (no test file), mark as NOT-TESTED.

## Step 4: Build the NIGC findings report

Generate `.forge/compliance/audits/[task-slug]-AUDIT.md`:

```markdown
# Audit Report: [task-slug]
**Date**: [ISO timestamp]
**Change Request**: [CR-ID]
**Standard**: NIGC 25 CFR 543.20(g) — Management Information Systems Controls
**Auditor**: forge (automated) + [git user.name] (authorized)

## Executive Summary

Total requirements: [N]
Passed: [N]
Failed: [N]
Not tested: [N]

Release recommendation: [APPROVED | BLOCKED — resolve failures before release]

## Findings

| REQ ID | Title | Test File | Result | Evidence |
|---|---|---|---|---|
| REQ-001 | [title] | test/auth.test.ts | PASS | Line 42 |
| REQ-002 | [title] | — | NOT-TESTED | No test found |
| REQ-003 | [title] | test/api.test.ts | FAIL | Line 15 failed: [error] |

## Requirement Details

### REQ-001: [title]
**Verification method**: Automated test — test/auth.test.ts:42
**Result**: PASS
**Evidence**: `[test description]`

### REQ-002: [title]
**Verification method**: Manual review required (no automated test found)
**Result**: NOT-TESTED
**Action required**: Write a test that covers this requirement before release.

[... one section per requirement ...]

## Conclusion

[If all PASS:]
All [N] requirements verified. Change Request [CR-ID] is ready for Gate 3 release.

[If any FAIL or NOT-TESTED:]
[N] requirement(s) are not verified. Resolve before running /forge:release.

Requirements needing action:
- REQ-002: write a test
- REQ-003: fix failing test
```

## Step 5: Append to audit trail

Append to `.forge/compliance/audit-trail.md`:
```json
[{ "action": "audit:complete", "actor": "[user]", "reference": "[CR-ID] — [N] PASS, [N] FAIL, [N] NOT-TESTED" }]
```

## Step 6: Update state

Update `.forge/state/current.md`:
- **Last action**: audit complete — [N] PASS, [N] FAIL, [N] NOT-TESTED
- **Next action**: [if all pass: "run /forge:release" | else: "fix failing requirements"]
- **Last updated**: [ISO timestamp]

## Step 7: Display results

Show the full findings table and the conclusion section.

Tell the user:
```
AUDIT COMPLETE
══════════════════════════════════════════════════
Report: .forge/compliance/audits/[task-slug]-AUDIT.md

Requirements: [N] total
  PASS:       [N]
  FAIL:       [N]
  NOT-TESTED: [N]

[If all pass:]
  All requirements verified. Ready for /forge:release.

[If any fail or not-tested:]
  RELEASE BLOCKED — resolve findings above.
══════════════════════════════════════════════════
```
