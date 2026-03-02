# Forge Health — Coming in Phase 4

This command is planned for Phase 4 (Operational Commands).

When implemented, `/forge:health` will validate the `.forge/` directory structure:
- All required directories exist
- `config.json` is valid JSON and matches the expected schema
- `audit-trail.md` exists and is properly formatted
- `state/current.md` exists and has all required fields
- `map/map.md` exists (warn if it was generated more than 30 days ago)
- `map/project-graph.json` is valid JSON
- No orphaned BLOCKED.md files without corresponding SUMMARY.md
- No plan files without entries in MANIFEST.md
- No compliance artifacts that appear incomplete (missing required fields)

Output: a health check report with PASS/WARN/FAIL for each check, and
a list of remediation commands for any failures.

Run this periodically or before a major release to ensure the forge state is clean.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
