# Forge Health Workflow

Validate the `.forge/` directory structure, detect issues, and report remediation steps.
This workflow is invoked by `/forge:health`.

Run this before a major release, after onboarding a new team member, or any time
forge state feels inconsistent.

## Step 1: Verify .forge/ exists

Check if `.forge/` exists in the current working directory.

If not:
```
No .forge/ directory found.

This project has not been initialized with forge.
Run /forge:map to set up the .forge/ directory structure.
```
Stop.

## Step 2: Run health checks

Run each check below. For each one, record: `PASS`, `WARN`, or `FAIL`.

A `FAIL` means something is broken or missing that affects forge functionality.
A `WARN` means something is stale, incomplete, or inconsistent but not blocking.
A `PASS` means the check is fully satisfied.

---

### CHECK 1: Required directories

Each of these must exist:
- `.forge/map/`
- `.forge/compliance/change-requests/`
- `.forge/compliance/deployment-logs/`
- `.forge/compliance/security-audits/`
- `.forge/compliance/incidents/`
- `.forge/state/`
- `.forge/plans/`
- `.forge/specs/`
- `.forge/instincts/`
- `.forge/skills/`

**PASS**: All directories exist.
**WARN**: Some optional directories are missing (instincts/, skills/).
**FAIL**: Core directories are missing (map/, compliance/, state/, plans/).

Remediation for FAIL: `mkdir -p .forge/map .forge/compliance/change-requests .forge/compliance/deployment-logs .forge/state .forge/plans`

---

### CHECK 2: config.json

Check `.forge/config.json`:

**PASS**: File exists and is valid JSON with at least `workflow`, `gates`, and `compliance` keys.
**WARN**: File exists but is missing some expected keys.
**FAIL**: File does not exist or is not valid JSON.

Remediation for FAIL: `Run /forge:map to regenerate config.json`

---

### CHECK 3: Audit trail

Check `.forge/compliance/audit-trail.md`:

**PASS**: File exists and has at least the header table plus one entry.
**WARN**: File exists but has no entries beyond the header (never been used).
**FAIL**: File does not exist.

Remediation for FAIL: `Run /forge:map to initialize the audit trail`

---

### CHECK 4: Current state file

Check `.forge/state.json`:

Required JSON fields:
- `version`
- `phase`
- `updated_at`
- `build`

**PASS**: File exists, is valid JSON, and all required fields are present.
**WARN**: File exists but one or more fields are missing or the JSON is malformed.
**FAIL**: File does not exist.

Remediation for FAIL: `Run /forge:map to initialize the state file`

---

### CHECK 5: Project map currency

Check `.forge/map/map.md`:

**PASS**: File exists and was generated within the last 30 days.
**WARN**: File exists but was generated more than 30 days ago (may be stale).
**FAIL**: File does not exist.

To check age: read the `**Generated**:` field and compare to today.
Calculate days since generation.

Remediation for WARN/FAIL:
- WARN: `Run /forge:drift to check for divergence, then /forge:map to refresh`
- FAIL: `Run /forge:map to generate the project map`

---

### CHECK 6: project-graph.json

Check `.forge/map/project-graph.json`:

**PASS**: File exists and is valid JSON with `entities` and `relationships` arrays.
**WARN**: File exists but `entities` array is empty.
**FAIL**: File does not exist or is not valid JSON.

Remediation for FAIL: `Run /forge:map to regenerate project-graph.json`

---

### CHECK 7: Orphaned BLOCKED files

Scan `.forge/plans/` for files matching `*-BLOCKED.md`.
For each `[plan-id]-BLOCKED.md` found:
- Check if `[plan-id]-SUMMARY.md` also exists in `.forge/plans/`
- If the SUMMARY exists, the block was resolved — ignore
- If no SUMMARY, the block was never resolved

**PASS**: No unresolved BLOCKED files.
**WARN**: One or more BLOCKED files with no matching SUMMARY — these plans are stuck.
**FAIL**: N/A (WARN is the highest for this check)

Remediation for WARN: For each orphaned BLOCKED file, read it and report the plan ID
and blocker description so the user can decide what to do.

---

### CHECK 8: Open change requests

Scan `.forge/compliance/change-requests/` for files matching `CR-*.md`
(but NOT `CR-*-REVIEW.md`).

For each CR file:
- Read the `**Status**:` field
- If `AUTHORIZED` with no matching worktree branch: the build may have been abandoned
- If `COMPLETE`: fine
- If `CANCELLED`: fine

**PASS**: All CRs are either COMPLETE or CANCELLED.
**WARN**: One or more CRs in AUTHORIZED state (build may be in progress or stuck).
**FAIL**: N/A

Remediation for WARN: List the AUTHORIZED CRs. User can run `/forge:status` to check.

---

### CHECK 9: Incomplete compliance artifacts

Scan `.forge/compliance/change-requests/` for CR files missing required fields.

Required fields in a CR file:
- `**Change Request**:`
- `**Status**:`
- `**Authorized by**:`
- `**Authorized at**:`

**PASS**: All CR files have required fields.
**WARN**: One or more CR files are missing fields (may have been manually created or truncated).
**FAIL**: N/A

---

### CHECK 10: Security audit currency (if applicable)

Check `.forge/compliance/security-audits/` for any files.

If any security audit exists:
- Find the most recent one (by filename date prefix `YYYY-MM-DD`)
- Check if it was generated within the last 90 days

**PASS**: A security audit exists and is less than 90 days old.
**WARN**: Most recent security audit is older than 90 days (NIGC recommends periodic scans).
**INFO**: No security audits exist (only warn if this is a mature project with CRs present).

Remediation for WARN: `Run /forge:secure to generate a fresh security audit`

---

## Step 3: Display health report

Display all results:

```
FORGE HEALTH CHECK
══════════════════════════════════════════════════
Project: [task from state.json, or directory name]
Checked: [ISO timestamp]

 CHECK                        RESULT    NOTES
 ─────────────────────────────────────────────
 Required directories         [PASS/WARN/FAIL]  [detail if not PASS]
 config.json                  [PASS/WARN/FAIL]
 Audit trail                  [PASS/WARN/FAIL]
 Current state file           [PASS/WARN/FAIL]
 Project map currency         [PASS/WARN/FAIL]  [age if exists]
 project-graph.json           [PASS/WARN/FAIL]
 Orphaned BLOCKED files       [PASS/WARN]       [N orphaned if WARN]
 Open change requests         [PASS/WARN]       [N open if WARN]
 Incomplete compliance files  [PASS/WARN]       [N incomplete if WARN]
 Security audit currency      [PASS/WARN/INFO]  [age if exists]

══════════════════════════════════════════════════
Summary: [N PASS] [N WARN] [N FAIL]
```

If all PASS:
```
All checks passed. Forge state is clean.
```

If any WARN:
```
Warnings found. Review and remediate if needed before next release.
```

If any FAIL:
```
⚠ Failures found. Forge functionality may be impaired.
Remediate before running /forge:authorize or /forge:release.
```

## Step 4: Remediation guide

If any check produced WARN or FAIL, display the remediation steps:

```
REMEDIATION STEPS
──────────────────────────────────────────────────
[For each FAIL/WARN in order of severity:]

[Check name] — [FAIL/WARN]
  [Issue description]
  Fix: [command or action]

──────────────────────────────────────────────────
```

## Step 5: Append to audit trail

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | health:checked | forge | [N pass, N warn, N fail] |
```
