# Forge Docs Workflow

Generate a TICS (Technical Implementation and Compliance Summary) document from the
actual compliance artifacts in `.forge/compliance/`. The TICS is the primary entry point
for a CNGC auditor conducting an IT audit under NIGC 25 CFR 543.20.

This workflow is invoked by `/forge:docs`. No subagent is spawned — it runs in main
context, reads compliance artifacts directly, and writes one output document.

Run this when preparing for an IT audit, at release time, or any time you need a
consolidated view of your compliance posture.

---

## Step 1: Verify .forge/ exists

Check if `.forge/` and `.forge/compliance/` exist in the current working directory.

If not:
```
No .forge/ directory found.

This project has not been initialized with forge.
Run /forge:map to set up the .forge/ directory structure.
```
Stop.

Read `.forge/state/current.md` to get the project name and any active CR-ID.

---

## Step 2: Announce what's happening

Tell the user:
```
TICS DOCUMENTATION GENERATOR
══════════════════════════════════════════════════
Scanning: .forge/compliance/
Standard: NIGC 25 CFR 543.20 — Management Information Systems Controls

Collecting:
  ✓ Change requests       (.forge/compliance/change-requests/CR-*.md)
  ✓ Four-eyes reviews     (.forge/compliance/change-requests/CR-*-REVIEW.md)
  ✓ Deployment logs       (.forge/compliance/deployment-logs/*.md)
  ✓ Security audits       (.forge/compliance/security-audits/*.md)
  ✓ Incident reports      (.forge/compliance/incidents/INC-*.md)
  ✓ Audit trail           (.forge/compliance/audit-trail.md)
══════════════════════════════════════════════════
```

---

## Step 3: Collect all compliance artifacts

Scan each subdirectory and collect file metadata. For each artifact type, read the file
and extract the key fields listed below.

### 3a: Change Requests

Scan `.forge/compliance/change-requests/` for files matching `CR-[0-9]*.md` (exclude
any `-REVIEW.md` suffix). For each file found, extract:
- **ID**: value after `# Change Request:` or the filename itself
- **Title**: value of `**Title**:` field
- **Date**: value of `**Date**:` field
- **Status**: value of `**Status**:` field (`AUTHORIZED`, `COMPLETE`, `CANCELLED`)
- **Authorized by**: value of `**Authorized by**:` field

Store as list `cr_list`.

### 3b: Four-Eyes Review Records

Scan `.forge/compliance/change-requests/` for files matching `CR-*-REVIEW.md`. For each:
- **CR-ID**: the base CR-ID (filename minus `-REVIEW.md`)
- **Reviewed by**: value of `**Reviewed by**:` field
- **Reviewed at**: value of `**Reviewed at**:` field

Store as list `review_list`.

### 3c: Deployment Logs

Scan `.forge/compliance/deployment-logs/` for all `.md` files. For each:
- **Version**: value of `**Version**:` field
- **Date**: value of `**Date**:` field
- **Change Request**: value of `**Change Request**:` field
- **Environment**: value of `**Environment**:` field
- **Approved by**: value of `**Approved by**:` field
- **Verification**: value of `**Verification**:` field

Store as list `deploy_list`.

### 3d: Security Audits

Scan `.forge/compliance/security-audits/` for all `.md` files (exclude `.json` files).
Sort by filename date prefix (descending — most recent first). For each:
- **Date**: YYYY-MM-DD from filename prefix
- **CR-ID**: value of `**Change Request**:` field (may be "standalone")
- **Findings summary**: count lines starting with `| CRITICAL`, `| HIGH`, `| MEDIUM`
  or extract the summary table

Store as list `audit_list`.

### 3e: Incident Reports

Scan `.forge/compliance/incidents/` for files matching `INC-*.md`. For each:
- **ID**: value after `# Incident Report:` or from filename
- **Severity**: value of `**Severity**:` field (P1, P2, P3)
- **Date**: value of `**Opened**:` or `**Date**:` field
- **Status**: value of `**Status**:` field (RESOLVED, OPEN, DEBRIEF-COMPLETE)
- **Root cause**: value of `**Root Cause**:` field (first line only)

Store as list `incident_list`.

### 3f: Audit Trail

Read `.forge/compliance/audit-trail.md`.
- Count the number of table rows (lines starting with `| ` after the header)
- Find the earliest and most recent timestamp in the table
- Store as `audit_trail_entries` (count), `audit_trail_start`, `audit_trail_end`

---

## Step 4: Procedural controls checklist (interactive)

Procedural controls cannot be read from files — they exist in git settings and
operational policy. Ask the user these four questions now.

Tell the user:
```
PROCEDURAL CONTROLS CHECKLIST
──────────────────────────────────────────────────
These controls exist outside .forge/ and must be confirmed manually.
Answer Y or N for each. Your answers will appear in the TICS.

1. Branch protection: Is the main/master branch protected from direct pushes?
   (GitHub: Settings → Branches → Branch protection rules)
   [Y/N]:
```
Wait for answer. Store as `ctrl_branch_protection`.

```
2. Access control: Is push access to the main branch restricted to named individuals?
   If yes, list who:
```
Wait for answer. Store as `ctrl_access_control` and `ctrl_access_list` (the names/roles).

```
3. Backup testing: Has the database/system backup been tested (restore verified)?
   If yes, when was it last tested (approximate date or "N/A"):
```
Wait for answer. Store as `ctrl_backup_tested` and `ctrl_backup_date`.

```
4. Incident response tested: Has the incident response procedure been run at least once
   in the last 12 months (either a real incident or a drill)?
   [Y/N]:
```
Wait for answer. Store as `ctrl_ir_tested`.

---

## Step 5: Map NIGC sub-requirements to evidence

For each sub-requirement, determine status: **SATISFIED**, **PARTIAL**, or **GAP**.

### § 543.20(a) — Change Management Procedures
**Evidence**: `cr_list`
- **SATISFIED**: `cr_list` is non-empty and all COMPLETE CRs have `Authorized by` populated
- **PARTIAL**: `cr_list` is non-empty but some CRs are missing `Authorized by` or `Status`
- **GAP**: `cr_list` is empty (no change management process in use)

### § 543.20(b) — Pre-Deployment Testing
**Evidence**: `deploy_list` + `audit_list`

Build `cr_ids_with_deployments` = set of CR-IDs referenced in `deploy_list`.
Build `cr_ids_with_security_audits` = set of CR-IDs referenced in `audit_list`.

- **SATISFIED**: Every CR-ID in `cr_ids_with_deployments` also appears in
  `cr_ids_with_security_audits`, OR `audit_list` contains a standalone audit dated
  within 90 days of each deployment
- **PARTIAL**: Some deployed CRs have no matching security audit
- **GAP**: `deploy_list` is non-empty and `audit_list` is empty (deployed without any security review)

Also note plan SUMMARY files: scan `.forge/plans/` for `*-SUMMARY.md` files. Their presence
confirms implementation testing was done before each build.

### § 543.20(c) — Access Controls
**Evidence**: procedural controls checklist answers
- **SATISFIED**: `ctrl_branch_protection` = Y AND `ctrl_access_control` = Y
- **PARTIAL**: One of the two = Y
- **GAP**: Both = N

### § 543.20(d) — Audit Trail
**Evidence**: `audit-trail.md`
- **SATISFIED**: `audit_trail_entries` >= 5 (active log with meaningful history)
- **PARTIAL**: File exists but `audit_trail_entries` < 5 (recently initialized)
- **GAP**: File does not exist

### § 543.20(e) — Incident Response
**Evidence**: `incident_list`
- **SATISFIED**: `incident_list` is non-empty OR `ctrl_ir_tested` = Y
  (having a tested procedure with no incidents is compliant)
- **PARTIAL**: Incidents exist but some are missing root cause or debrief
- **GAP**: `incident_list` is empty AND `ctrl_ir_tested` = N
  (no procedure, no incidents, no drills — untested)

### § 543.20(f) — Security Reviews
**Evidence**: `audit_list`
- **SATISFIED**: `audit_list` is non-empty AND most recent audit is < 90 days old
- **PARTIAL**: Audits exist but most recent is >= 90 days old (stale)
- **GAP**: `audit_list` is empty

### § 543.20(g) — Segregation of Duties
**Evidence**: `review_list`

Build `cr_ids_authorized` = set of CR-IDs where Status = AUTHORIZED or COMPLETE.
Build `cr_ids_reviewed` = set of CR-IDs in `review_list`.

- **SATISFIED**: Every CR-ID in `cr_ids_authorized` also appears in `cr_ids_reviewed`
- **PARTIAL**: Some COMPLETE CRs have no corresponding REVIEW.md (four-eyes gap on old CRs)
- **GAP**: `cr_ids_authorized` is non-empty and `cr_ids_reviewed` is empty
  (changes authorized but never reviewed by a second party)

---

## Step 6: Identify compliance gaps

Collect all requirements where status = **GAP** or **PARTIAL**.

For each gap, determine risk level:
- **CRITICAL**: § 543.20(g) GAP (no four-eyes records at all) or § 543.20(d) GAP (no audit trail)
- **HIGH**: § 543.20(a) GAP or § 543.20(f) GAP
- **MEDIUM**: Any PARTIAL status, § 543.20(e) GAP, § 543.20(c) PARTIAL
- **LOW**: § 543.20(b) PARTIAL (some CRs missing security review — not all)

Determine overall compliance posture:
- **COMPLIANT**: All 7 requirements = SATISFIED
- **GAPS IDENTIFIED**: One or more = PARTIAL, none = GAP
- **NON-COMPLIANT**: One or more = GAP

---

## Step 7: Write the TICS document

Determine the output filename: `TICS-[YYYY-MM-DD].md` using today's date.
Write to `.forge/compliance/TICS-[YYYY-MM-DD].md`.

Use the exact template below, filling in all bracketed values from the data collected:

```markdown
# Technical Implementation and Compliance Summary (TICS)

**Project**: [project name from state/current.md or directory name]
**Generated**: [ISO timestamp]
**Standard**: NIGC 25 CFR 543.20 — Management Information Systems Controls
**Period covered**: [audit_trail_start] — [audit_trail_end, or "present"]
**Prepared by**: forge (automated) / [git user.name] (authorized operator)
**Overall posture**: [COMPLIANT | GAPS IDENTIFIED | NON-COMPLIANT]

---

## Executive Summary

| Category | Count |
|---|---|
| Change Requests | [N] ([N] COMPLETE, [N] AUTHORIZED, [N] CANCELLED) |
| Deployments | [N] |
| Security Audits | [N] (most recent: [date or "none"]) |
| Incidents | [N] (P1: [N], P2: [N], P3: [N]) |
| Audit Trail Entries | [N] (from [start] to [end]) |

Overall compliance posture: **[COMPLIANT | GAPS IDENTIFIED | NON-COMPLIANT]**

[If COMPLIANT:]
All seven NIGC 25 CFR 543.20 sub-requirements are satisfied by documented evidence.

[If GAPS IDENTIFIED:]
[N] sub-requirement(s) show partial coverage. See Part 4 for remediation steps.

[If NON-COMPLIANT:]
[N] sub-requirement(s) have no satisfying evidence. Immediate remediation required.
See Part 4 for specific findings.

---

## Part 1: NIGC 25 CFR 543.20 Requirements Mapping

### § 543.20(a) — Change Management Procedures
**Requirement**: Documented procedures for the management of changes to information systems,
including authorization, testing, and implementation.
**Status**: [SATISFIED | PARTIAL | GAP]
**Evidence**:
[If cr_list non-empty:]
- [N] change request(s) found in `.forge/compliance/change-requests/`
- [List each CR: "- CR-YYYY-NNN: [Title] ([Status]) — authorized by [Authorized by]"]
[If cr_list empty:]
- No change request documents found.

---

### § 543.20(b) — Pre-Deployment Testing
**Requirement**: Testing of changes in a non-production environment before deployment
to the live system.
**Status**: [SATISFIED | PARTIAL | GAP]
**Evidence**:
[If deploy_list non-empty:]
- [N] deployment(s) recorded in `.forge/compliance/deployment-logs/`
[If audit_list non-empty:]
- [N] pre-deployment security review(s) found
[List CRs with matched audits: "- CR-YYYY-NNN: security audit [date]"]
[If any CRs have no matching audit:]
- CRs with no pre-deployment security audit: [list CR-IDs]
[If plan summaries found:]
- [N] implementation test summary file(s) in `.forge/plans/`

---

### § 543.20(c) — Access Controls
**Requirement**: Access controls to restrict unauthorized changes to information systems.
**Status**: [SATISFIED | PARTIAL | GAP]
**Evidence** (operator-confirmed):
- Branch protection (main): [ctrl_branch_protection — YES / NO]
- Push access restricted: [ctrl_access_control — YES / NO]
[If ctrl_access_list provided:]
  Authorized principals: [ctrl_access_list]

---

### § 543.20(d) — Audit Trail
**Requirement**: An audit trail that logs access and changes to critical information systems.
**Status**: [SATISFIED | PARTIAL | GAP]
**Evidence**:
[If audit trail exists:]
- `.forge/compliance/audit-trail.md`: [audit_trail_entries] entries
  Period: [audit_trail_start] — [audit_trail_end]
  File is append-only and version-controlled in git.
[If no audit trail:]
- No audit trail file found.

---

### § 543.20(e) — Incident Response
**Requirement**: Procedures for responding to security incidents and system failures,
including documented response and post-incident review.
**Status**: [SATISFIED | PARTIAL | GAP]
**Evidence**:
[If incident_list non-empty:]
- [N] incident report(s) found in `.forge/compliance/incidents/`
[List each: "- [ID] ([Severity]): [Root cause first line] — [Status]"]
[If incident_list empty and ctrl_ir_tested = Y:]
- No incidents recorded. Incident response procedure confirmed tested (operator-verified).
[If incident_list empty and ctrl_ir_tested = N:]
- No incidents recorded and no drill confirmed. Procedure is untested.

---

### § 543.20(f) — Security Reviews
**Requirement**: Periodic security reviews of information systems, including vulnerability
assessment and remediation tracking.
**Status**: [SATISFIED | PARTIAL | GAP]
**Evidence**:
[If audit_list non-empty:]
- [N] security audit report(s) in `.forge/compliance/security-audits/`
[List each: "- [date]: [CR-ID or 'standalone']"]
  Most recent: [date] ([N days ago])
[If audit_list empty:]
- No security audit reports found.

---

### § 543.20(g) — Segregation of Duties
**Requirement**: Separation between the individuals who develop, authorize, and deploy
changes to information systems (four-eyes principle).
**Status**: [SATISFIED | PARTIAL | GAP]
**Evidence**:
[If review_list non-empty:]
- [N] four-eyes review record(s) in `.forge/compliance/change-requests/`
[List each: "- CR-YYYY-NNN-REVIEW.md: reviewed by [Reviewed by] at [Reviewed at]"]
[If any COMPLETE CRs have no review:]
- CRs without four-eyes review record: [list CR-IDs]
[If review_list empty and cr_list non-empty:]
- [N] change request(s) exist but no four-eyes review records found.

---

## Part 2: Artifact Index

### Change Requests
[If cr_list non-empty:]
| ID | Title | Date | Status | Authorized by |
|---|---|---|---|---|
[One row per CR]
[If cr_list empty:]
No change requests found.

### Four-Eyes Reviews
[If review_list non-empty:]
| CR-ID | Reviewed by | Reviewed at |
|---|---|---|
[One row per review]
[If review_list empty:]
No four-eyes review records found.

### Deployment Logs
[If deploy_list non-empty:]
| Version | Date | Change Request | Environment | Approved by | Verification |
|---|---|---|---|---|---|
[One row per deployment]
[If deploy_list empty:]
No deployment logs found.

### Security Audits
[If audit_list non-empty:]
| Date | Change Request | Notes |
|---|---|---|
[One row per audit]
[If audit_list empty:]
No security audit reports found.

### Incident Reports
[If incident_list non-empty:]
| ID | Severity | Date | Status | Root Cause (summary) |
|---|---|---|---|---|
[One row per incident]
[If incident_list empty:]
No incident reports on record.

### Audit Trail
[If audit trail exists:]
- File: `.forge/compliance/audit-trail.md`
- Entries: [audit_trail_entries]
- Period: [audit_trail_start] — [audit_trail_end]
- Storage: version-controlled in git (tamper-evident)
[If no audit trail:]
- Audit trail file not found.

---

## Part 3: Procedural Controls

These controls were confirmed interactively by the authorized operator at time of generation.

| Control | Status | Notes |
|---|---|---|
| Branch protection (main branch) | [YES / NO] | Prevents direct push to production branch |
| Push access restricted | [YES / NO] | [ctrl_access_list or "not specified"] |
| Backup restore tested | [YES / NO] | [ctrl_backup_date or "not confirmed"] |
| Incident response procedure tested | [YES / NO] | [from ctrl_ir_tested] |

---

## Part 4: Compliance Gaps

[If no gaps:]
No compliance gaps identified. All NIGC 25 CFR 543.20 sub-requirements are satisfied
by documented evidence in `.forge/compliance/`.

[If gaps exist — one section per gap, ordered by risk level:]

### Gap [N]: [§ 543.20(x)] — [Short name]
**Requirement**: [Full requirement text]
**Finding**: [What evidence is missing or insufficient]
**Risk**: [CRITICAL | HIGH | MEDIUM | LOW]
**Remediation**:
- [Specific action to close the gap]
- [Command to run if applicable, e.g., "Run /forge:secure to generate a security audit"]

---

## Part 5: Auditor Notes

This document was generated automatically by forge from artifacts in `.forge/compliance/`.
All referenced artifacts are available for inspection at the paths listed in Part 2.

Procedural controls in Part 3 were confirmed interactively by the authorized operator
([git user.name]) at [ISO timestamp]. These answers are not independently verifiable
from file artifacts.

This TICS covers the period from the earliest recorded audit-trail entry to the date
of generation. Prior records, if any, exist in git history.

For a complete audit trail, inspect the git log of `.forge/compliance/audit-trail.md`.

**Prepared by**: forge (automated generation tool)
**Authorized by**: [git user.name]
**Date**: [ISO timestamp]
```

---

## Step 8: Append to audit trail

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | docs:tics-generated | [git user.name] | TICS-[YYYY-MM-DD].md — [posture] |
```

---

## Step 9: Update state

Update `.forge/state/current.md`:
- **Last action**: TICS generated — [posture], [N] gaps
- **Next action**: [if COMPLIANT: "TICS ready for auditor review" | if gaps: "resolve compliance gaps then regenerate TICS"]
- **Last updated**: [ISO timestamp]

---

## Step 10: Display summary

Tell the user:

```
TICS GENERATION COMPLETE
══════════════════════════════════════════════════
Document: .forge/compliance/TICS-[YYYY-MM-DD].md
Standard: NIGC 25 CFR 543.20
Posture:  [COMPLIANT | GAPS IDENTIFIED | NON-COMPLIANT]

Coverage:
  § 543.20(a) Change Management     [SATISFIED | PARTIAL | GAP]
  § 543.20(b) Pre-Deployment Testing [SATISFIED | PARTIAL | GAP]
  § 543.20(c) Access Controls        [SATISFIED | PARTIAL | GAP]
  § 543.20(d) Audit Trail            [SATISFIED | PARTIAL | GAP]
  § 543.20(e) Incident Response      [SATISFIED | PARTIAL | GAP]
  § 543.20(f) Security Reviews       [SATISFIED | PARTIAL | GAP]
  § 543.20(g) Segregation of Duties  [SATISFIED | PARTIAL | GAP]

Artifacts indexed: [N CR] CR, [N deploy] deployments, [N audits] security audits,
  [N incidents] incidents, [N audit entries] audit trail entries
══════════════════════════════════════════════════
[If COMPLIANT:]
  All requirements satisfied. TICS is ready for auditor review.

[If GAPS IDENTIFIED:]
  [N] gap(s) identified. See Part 4 of the TICS for remediation steps.
  Resolve gaps and run /forge:docs again to regenerate.

[If NON-COMPLIANT:]
  ⚠ [N] critical gap(s) found. TICS reflects current state for transparency.
  Resolve findings in Part 4 before submitting to a CNGC auditor.
══════════════════════════════════════════════════
```
