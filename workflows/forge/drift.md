# Forge Drift — Coming in Phase 3

This command is planned for Phase 3 (Intelligence Layer).

When implemented, `/forge:drift` will detect divergence between the project map
and the actual codebase state. Drift accumulates when manual changes are made
outside the forge workflow.

Drift checks:
- Files referenced in `.forge/map/map.md` that no longer exist
- New files that exist in the codebase but aren't in the map
- Services that have changed their entry points or ports
- Dependencies that were added or removed since the last map generation
- Conventions that appear to have changed

Output: a drift report with specific divergences and a recommendation to
run `/forge:map` to regenerate.

The map auto-updates after each `/forge:build` and `/forge:release` cycle,
so drift primarily accumulates from manual changes outside forge.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
