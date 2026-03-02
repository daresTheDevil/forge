# Forge Audit — Coming in Phase 2

This command is planned for Phase 2 (Compliance Layer).

When implemented, `/forge:audit` will:
- Verify all requirements from the current spec are implemented and passing
- Read every REQ-NNN from the approved spec
- For each requirement: run the acceptance criteria tests and verify they pass
- Produce a NIGC-formatted findings report
- Report format matches what a CNGC IT auditor expects: requirement ID, description,
  verification method, result (PASS/FAIL/NOT-TESTED), and evidence reference

Output: `.forge/compliance/audits/[slug]-AUDIT.md`

This is separate from the plan-checker — it runs against the live codebase, not the plan.
It's the final gate check before `/forge:release`.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
