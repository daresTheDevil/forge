# Forge Fire Workflow — Incident Response

Structured incident response: TRIAGE → ISOLATE → DIAGNOSE → PATCH → VERIFY → DEBRIEF
This workflow is invoked by `/forge:fire`.

**Speed over perfection. Stop the bleeding first. Understand it second.**

## Setup: Assign Incident ID

Count files matching `INC-YYYY-*.md` in `.forge/compliance/incidents/` for the current year.
Next incident number = max existing + 1, formatted as `INC-YYYY-NNN`.

Create `.forge/compliance/incidents/` if it does not exist.

Initialize a running timeline (in memory for now — written to debrief at end):
```
[ISO timestamp] | INCIDENT OPENED | INC-[ID]
```

Display:
```
🔥 INCIDENT RESPONSE ACTIVATED
══════════════════════════════════════════════════
Incident: INC-[ID]
Opened:   [ISO timestamp]
══════════════════════════════════════════════════
```

---

## STAGE 1: TRIAGE

Goal: understand what's broken, who's affected, and how bad it is.

Ask the user:
```
TRIAGE
──────────────────────────────────────────────────
Describe the incident in one sentence:
>
```
Wait for response. Record as `incident_description`.

Then ask:
```
Severity assessment:

  P1 — Production is DOWN or severely degraded.
       Primary user functions are broken. Revenue/compliance impact NOW.

  P2 — Major feature broken, but workaround exists.
       Significant user impact. Escalating if not fixed soon.

  P3 — Minor feature affected. Low user impact.
       Can wait for normal process, but track it.

Severity? [P1/P2/P3]:
```
Wait for response. Record as `severity`.

Then ask:
```
What systems/services are affected?
(e.g. "auth service, user dashboard, payment API"):
>
```
Wait for response. Record as `affected_systems`.

Then ask:
```
When did this start? Approximate time:
(e.g. "~14:30", "after the 15:00 deploy", "noticed 10 min ago"):
>
```
Wait for response. Record as `incident_start`.

Then ask:
```
How many users are affected?
(e.g. "all users", "users in EU region", "~50 users on enterprise tier", "unknown"):
>
```
Wait for response. Record as `user_impact`.

Add to timeline:
```
[ISO timestamp] | TRIAGE COMPLETE | P[N] | [affected_systems]
```

Display triage summary:
```
TRIAGE COMPLETE
──────────────────────────────────────────────────
Incident:        INC-[ID]
Severity:        [severity]
Description:     [incident_description]
Systems:         [affected_systems]
Started:         [incident_start]
User impact:     [user_impact]
──────────────────────────────────────────────────
```

---

## STAGE 2: ISOLATE

Goal: stop the bleeding. Do NOT diagnose while the incident is still spreading.

Isolation stops impact. Root cause analysis comes AFTER isolation.

Ask the user:
```
ISOLATE — Stop the Bleeding
──────────────────────────────────────────────────
Choose an isolation action (or describe your own):

  1. Rollback — revert the most recent deploy
  2. Feature flag — disable the affected feature
  3. Traffic redirect — route traffic away from failing service
  4. Service stop — take the affected service offline (if degraded > down)
  5. Rate limit — throttle requests to failing endpoint
  6. Already isolated — incident is contained, proceed to diagnose
  7. Cannot isolate — describe why below

Action [1-7 or describe]:
```
Wait for response. Record as `isolation_action`.

If user chose options 1-5 or a custom isolation:
```
Describe what was done to isolate:
(e.g. "ran: kubectl rollout undo deployment/api", "set FEATURE_AUTH_V2=false"):
>
```
Wait. Record as `isolation_detail`.

```
Is the bleeding stopped? Is impact stabilized? [y/n]:
```
Wait. If "n", ask again and repeat the isolation step.

Once "y":
Add to timeline:
```
[ISO timestamp] | ISOLATED | [isolation_action] | [isolation_detail]
```

Display:
```
ISOLATED — Incident is contained.
Now we diagnose the root cause.
──────────────────────────────────────────────────
```

---

## STAGE 3: DIAGNOSE

Goal: structured root-cause analysis. Not guessing — evidence.

Read `.forge/map/infra.md` if it exists — understand the system topology before
asking the user to dig through logs.

Ask the user to investigate in this order. For each check, ask if the user wants
to run it now or skip it (some checks won't apply to every incident).

```
DIAGNOSE — Root Cause Analysis
──────────────────────────────────────────────────
Work through these checks in order. Each check must produce evidence
before moving to the next.

Check 1: Recent deploys / changes
  What changed in the last 2 hours? (git log, deploy history, config changes)
  Suspicion: [y/n]?

Check 2: Error logs
  What do the logs say? (app logs, error tracking, k8s events)
  Paste key lines or describe findings:
  >

Check 3: Environment and config
  Are env vars and config correct? Did anything change recently?
  Suspicion: [y/n]?

Check 4: Dependencies
  Did any service this depends on change or go down?
  Suspicion: [y/n]?

Check 5: Data
  Is there a data anomaly (bad record, null where not expected, migration issue)?
  Suspicion: [y/n]?
──────────────────────────────────────────────────
Root cause identified? [y/n]:
```

Wait for response. If "y":
```
State the root cause:
>
```
Record as `root_cause`.

Add to timeline:
```
[ISO timestamp] | ROOT CAUSE IDENTIFIED | [root_cause]
```

---

## STAGE 4: PATCH

Goal: minimal fix. Even under pressure, tests are required.

Display:
```
PATCH — Implement the Fix
──────────────────────────────────────────────────
Root cause: [root_cause]

Rules:
  - Implement the MINIMUM change that fixes the root cause
  - Write a test that would have caught this (even a simple one)
  - Do not refactor adjacent code under time pressure
  - Commit with: fix(INC-[ID]): [description]
──────────────────────────────────────────────────
Implement the fix now. Type 'done' when committed:
```

Wait for "done".

Ask:
```
Describe the fix implemented:
>
```
Record as `fix_description`.

Ask:
```
What test was added or what existing test covers this?
>
```
Record as `test_coverage`.

Add to timeline:
```
[ISO timestamp] | PATCHED | [fix_description]
```

---

## STAGE 5: VERIFY

Goal: confirm the fix works AND the system is stable overall.

Display:
```
VERIFY — Confirm Fix and Stability
──────────────────────────────────────────────────
Verify each of the following before declaring resolution:
```

Ask in sequence:

```
1. Does the specific failure no longer occur?
   (Test the exact scenario that broke) [y/n]:
```

```
2. Are all tests passing?
   (Run the test suite — no regressions) [y/n]:
```

```
3. Are the affected systems healthy?
   (Check metrics, logs, error rates) [y/n]:
```

```
4. Is user impact resolved?
   (If isolation was applied, has it been lifted?) [y/n]:
```

If any answer is "n": do not proceed. Ask the user to address the failing check.
Repeat until all four are "y".

Add to timeline:
```
[ISO timestamp] | VERIFIED | all checks passed
```

Display:
```
VERIFIED — System is stable. Incident resolved.
──────────────────────────────────────────────────
```

---

## STAGE 6: DEBRIEF

Goal: write the incident report for NIGC compliance records.

```
DEBRIEF — Writing Incident Report
──────────────────────────────────────────────────
```

Ask:
```
Any additional context for the incident report?
(e.g. contributing factors, what made this hard to diagnose, customer communication):
>
```
Record as `additional_context`. (Blank is fine.)

Ask:
```
Prevention action items — what would have prevented this?
(List 1-3 concrete actions, or press enter to skip):
1.
2.
3.
```
Record as `action_items`.

Calculate total incident duration (opened timestamp to now).

Write `.forge/compliance/incidents/INC-[ID].md`:

```markdown
# Incident Report: INC-[ID]
**Date**: [ISO timestamp of opening]
**Resolved**: [ISO timestamp of resolution]
**Duration**: [N hours M minutes]
**Severity**: [P1/P2/P3]
**Status**: RESOLVED

## Summary

[incident_description]

## Impact

- **Systems affected**: [affected_systems]
- **Users affected**: [user_impact]
- **Started**: [incident_start]
- **Detected**: [opened timestamp]
- **Resolved**: [resolved timestamp]

## Timeline

| Timestamp | Stage | Action |
|---|---|---|
[paste all timeline entries as table rows]

## Root Cause

[root_cause]

## Isolation

**Action taken**: [isolation_action]
**Details**: [isolation_detail]

## Fix

[fix_description]

**Test coverage**: [test_coverage]

## Verification

- Specific failure no longer occurs: ✓
- All tests passing: ✓
- Affected systems healthy: ✓
- User impact resolved: ✓

## Additional Context

[additional_context or "None."]

## Prevention Action Items

[If action_items provided:]
1. [action 1]
2. [action 2]
3. [action 3]

[If none: "No action items identified at this time."]

---

*This incident report satisfies NIGC 25 CFR 543.20 incident documentation requirements.*
*Incident ID: INC-[ID] | Forge version: Phase 4*
```

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | incident:resolved | forge | INC-[ID] — [severity] — [incident_description] |
```

Display:
```
INCIDENT CLOSED
══════════════════════════════════════════════════
Incident:   INC-[ID]
Severity:   [severity]
Duration:   [N hours M minutes]
Root cause: [root_cause]
Fix:        [fix_description]
Report:     .forge/compliance/incidents/INC-[ID].md
══════════════════════════════════════════════════
Good work. Document any follow-up tasks in your backlog.
```
