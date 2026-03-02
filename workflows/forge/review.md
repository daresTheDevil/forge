# Forge Review — Coming in Phase 2

This command is planned for Phase 2 (Compliance Layer).

When implemented, `/forge:review` will:
- Spawn the `forge-reviewer` agent to perform code review, test review, and documentation review
- Display the full diff of the build output
- Show test results and security audit findings
- Create a PR from the worktree branch to main
- Record the reviewer identity and timestamp as the Gate 2 four-eyes compliance artifact
- Write a four-eyes review record to `.forge/compliance/`

This is GATE 2 — the mandatory human review before any merge or release.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
