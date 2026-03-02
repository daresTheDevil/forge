# Forge Docs — Coming in Phase 5

This command is planned for Phase 5 (Documentation Generation).

When implemented, `/forge:docs` will:
- Generate TICS/SICS documentation from the actual workflow artifacts in `.forge/compliance/`
- Map each NIGC 25 CFR 543.20 requirement to the artifact or control that satisfies it
- Produce a TICS draft that the team can review and submit
- Include: evidence mapping, artifact index, compliance gaps (if any), checklist of
  branch protection, access control, and backup testing requirements

The TICS document references real artifacts — not generic claims. Every control mapped
to a specific file in `.forge/compliance/` that a CNGC auditor can inspect.

This is the last step in the compliance workflow. Run it when preparing for an IT audit.

Output: `.forge/compliance/TICS-[YYYY-MM-DD].md`

A CNGC auditor should be able to use this document as the entry point for an IT audit,
following references to specific artifacts for each requirement.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
