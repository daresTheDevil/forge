# Forge Learn — Coming in Phase 3

This command is planned for Phase 3 (Intelligence Layer).

When implemented, `/forge:learn` will:
- Analyze the current session: what was built, what patterns were used, what decisions were made
- Extract reusable patterns that could improve future sessions in this project
- Write patterns to `.forge/instincts/[YYYY-MM-DD-HH-pattern-name].md`
- Format: trigger condition, context, the pattern itself, when NOT to use it

Types of patterns captured:
- API endpoint structure patterns discovered or established this session
- Testing patterns for this specific stack
- Naming conventions that emerged
- Architectural decisions that should be preserved
- Anti-patterns discovered (things to avoid in this codebase)

The patterns in `.forge/instincts/` are automatically loaded into future sessions
via CLAUDE.md, making forge progressively smarter about your specific codebase.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
