# Forge Evolve — Coming in Phase 3

This command is planned for Phase 3 (Intelligence Layer).

When implemented, `/forge:evolve` will:
- Review all patterns accumulated in `.forge/instincts/`
- Classify each pattern into one of three types based on its trigger pattern:
  - **Command**: recurring explicit user requests → becomes a `/forge:` slash command
  - **Skill**: auto-triggered behaviors with consistent context → becomes a skill file
  - **Agent**: multi-step orchestration with a specific purpose → becomes an agent
- Propose the classification to the user for approval
- Generate the appropriate file (command stub, skill.md, or agent.md)

This is the compounding knowledge loop: learn → evolve → promote → global scope.

An instinct becomes a command when you find yourself asking for the same thing repeatedly.
An instinct becomes a skill when Claude should automatically apply it to a category of work.
An instinct becomes an agent when it requires multi-step autonomous execution.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
