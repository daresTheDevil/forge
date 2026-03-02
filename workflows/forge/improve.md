# Forge Improve — Coming in Phase 3

This command is planned for Phase 3 (Intelligence Layer).

When implemented, `/forge:improve` will:
- Run a post-build refactoring pass on the build output
- NEVER change functionality — only code quality, readability, and structure
- NEVER change function signatures, API contracts, or test assertions
- Target: dead code removal, naming improvements, complexity reduction,
  duplication elimination, and documentation gaps
- Verify all existing tests still pass after every change
- Make separate atomic commits so refactoring is distinguishable from feature work
- Cannot run autonomously before human review (requires the build to be complete)

This runs automatically as part of the full build cycle (after implementation,
before `/forge:review`), but can also be run standalone on any branch.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
