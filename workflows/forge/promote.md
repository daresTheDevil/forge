# Forge Promote — Coming in Phase 3

This command is planned for Phase 3 (Intelligence Layer).

When implemented, `/forge:promote` will:
- List all patterns in `.forge/instincts/` and ask which to promote
- Copy selected patterns to `~/.claude/instincts/` (global scope)
- Update `~/.claude/CLAUDE.md` to include the promoted patterns
- The promoted pattern is now available in every project on this machine

Use this when a pattern is not specific to this project — it applies broadly to
your development style or tech stack preferences.

Example promotable patterns:
- "Always check for existing utility functions before writing new ones"
- "Prefer named exports over default exports in TypeScript"
- "API responses always include a timestamp field"

Project-specific patterns (database schema conventions, service-specific error codes)
should stay in `.forge/instincts/` and NOT be promoted.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
