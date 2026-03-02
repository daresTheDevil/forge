# Forge Diagnose — Coming in Phase 4

This command is planned for Phase 4 (Operational Commands).

When implemented, `/forge:diagnose [description of failure]` will:
- Spawn the `forge-debugger` agent to perform structured root-cause triage
- Follow a systematic path: symptoms → hypothesis → evidence → root cause → fix
- NOT guess randomly — each step must produce evidence before moving to the next
- Check in a defined order: environment variables → config → connectivity → logs → code
- Reference `.forge/map/infra.md` to understand the system topology before diagnosing
- Distinguish between: configuration errors, code bugs, infrastructure failures,
  dependency issues, and data problems
- Write a structured diagnosis report with: root cause, evidence, fix applied, verification

This is a focused tool for failures during development. For production incidents,
use `/forge:fire` instead.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
