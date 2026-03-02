# Forge Fire — Coming in Phase 4

This command is planned for Phase 4 (Operational Commands).

When implemented, `/forge:fire` will activate structured incident response:

```
TRIAGE → ISOLATE → DIAGNOSE → PATCH → VERIFY → DEBRIEF
```

Each stage:
- **TRIAGE**: Assess severity, affected users/systems, blast radius. Assign severity P1/P2/P3.
- **ISOLATE**: Stop the bleeding — rollback, feature flag, traffic redirect, or service isolation.
  Do not diagnose while the incident is still growing.
- **DIAGNOSE**: Structured root-cause analysis. Read logs, check recent deploys, trace the failure.
- **PATCH**: Implement the minimal fix. Full tests required even under pressure.
- **VERIFY**: Confirm the fix works. Confirm the system is stable. Confirm no regressions.
- **DEBRIEF**: Write the incident report with timeline, root cause, fix, and prevention action items.

The debrief is written to `.forge/compliance/incidents/INC-[YYYY]-[NNN].md`.
This satisfies NIGC incident response documentation requirements.

The command keeps a running timeline throughout the incident, recording each stage
with timestamps so the debrief can be generated accurately.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
