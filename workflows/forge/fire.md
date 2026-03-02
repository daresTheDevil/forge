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

Use the AskUserQuestion tool with:
  - Yes, contained: Impact is stabilized — proceed to root cause diagnosis
  - No, still active: Isolation did not fully stop the incident — try another action
  - Partially mitigated: Impact is reduced but not fully contained — describe what remains

If the user selects "Other" and provides an explanation, read it carefully and determine
whether it represents containment, continued spread, or partial mitigation. Ask a
follow-up question if the intent is unclear.

If "No, still active" or "Partially mitigated": repeat the isolation step until contained.

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

Work through each check in order. Each check must produce evidence before moving to the next.

Display: "DIAGNOSE — Root Cause Analysis"

**Check 1: Recent deploys / changes**
Ask: "What changed in the last 2 hours? (git log, deploy history, config changes)"
Wait for free-text response.
Then use the AskUserQuestion tool with:
  - Yes, suspect: Recent changes are a likely cause — flag this for root cause
  - No, clear: Recent changes are not the cause
  - Uncertain: More investigation needed on this vector

If the user selects "Other" and provides an explanation, record their assessment faithfully.

**Check 2: Error logs**
Ask: "What do the logs say? (app logs, error tracking, k8s events) — paste key lines or describe findings:"
Wait for free-text response. Record the findings. No suspicion vote needed — logs provide direct evidence.

**Check 3: Environment and config**
Ask: "Are env vars and config correct? Did anything change recently?"
Wait for free-text response.
Then use the AskUserQuestion tool with:
  - Yes, suspect: Environment or config changes are a likely cause
  - No, clear: Environment and config look correct
  - Uncertain: More investigation needed on this vector

If the user selects "Other" and provides an explanation, record their assessment faithfully.

**Check 4: Dependencies**
Ask: "Did any service this depends on change or go down?"
Wait for free-text response.
Then use the AskUserQuestion tool with:
  - Yes, suspect: A dependency change or outage is a likely cause
  - No, clear: Upstream services look healthy
  - Uncertain: More investigation needed on this vector

If the user selects "Other" and provides an explanation, record their assessment faithfully.

**Check 5: Data**
Ask: "Is there a data anomaly? (bad record, null where not expected, migration issue)"
Wait for free-text response.
Then use the AskUserQuestion tool with:
  - Yes, suspect: A data issue is a likely cause
  - No, clear: Data looks correct
  - Uncertain: More investigation needed on this vector

If the user selects "Other" and provides an explanation, record their assessment faithfully.

**Root cause check:**
Use the AskUserQuestion tool with:
  - Yes, confirmed: Root cause has been identified — you will state it
  - No, still investigating: Evidence is insufficient — more digging needed
  - Partially: A candidate was identified but not fully confirmed

If the user selects "Other" and provides an explanation, read it carefully and determine
whether it represents a confirmed cause, an inconclusive result, or a partial identification.
Ask a follow-up question if the intent is unclear.

If "Yes, confirmed":
Ask: "State the root cause:"
Wait for free-text response.
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

Ask each verification check in sequence. Do not proceed to the next check until the
current one passes.

**Check 1: Does the specific failure no longer occur?**
Tell the user: "Test the exact scenario that broke."
Use the AskUserQuestion tool with:
  - Pass: The specific failure is gone — verified
  - Fail: The failure still occurs — fix is incomplete
  - Skip (with reason): This check cannot be run — describe why

If "Fail": do not proceed. Ask the user to address the issue and re-run this check.
If the user selects "Other", read their explanation and determine pass/fail/skip status.

**Check 2: Are all tests passing?**
Tell the user: "Run the test suite — confirm no regressions."
Use the AskUserQuestion tool with:
  - Pass: All tests are green — no regressions
  - Fail: Tests are failing — regression or test gap found
  - Skip (with reason): Test suite cannot be run — describe why

If "Fail": do not proceed. Ask the user to address the failing tests first.
If the user selects "Other", read their explanation and determine pass/fail/skip status.

**Check 3: Are the affected systems healthy?**
Tell the user: "Check metrics, logs, error rates."
Use the AskUserQuestion tool with:
  - Pass: Systems are healthy — error rates normal, no anomalies
  - Fail: Systems still show elevated errors or degraded metrics
  - Skip (with reason): Metrics unavailable — describe why

If "Fail": do not proceed. Ask the user to investigate the continued anomaly.
If the user selects "Other", read their explanation and determine pass/fail/skip status.

**Check 4: Is user impact resolved?**
Tell the user: "If isolation was applied (rollback, feature flag, traffic redirect), has it been lifted?"
Use the AskUserQuestion tool with:
  - Pass: User impact is fully resolved and any isolation measures have been lifted
  - Fail: Users are still impacted or isolation has not been lifted
  - Skip (with reason): Not applicable to this incident — describe why

If "Fail": do not proceed. Ask the user to lift isolation and confirm user impact is clear.
If the user selects "Other", read their explanation and determine pass/fail/skip status.

All four checks must pass (or be explicitly skipped with justification) before proceeding.

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
