# Forge Settings — Coming in Phase 1 (post-core)

This command is planned for completion after the core workflow commands are stable.

When implemented, `/forge:settings` will:
- Display the current `.forge/config.json` settings in a readable format
- Show which values come from project config vs user config vs built-in defaults
- Allow interactive editing of any setting
- Validate the settings against the schema before saving
- Explain what each setting does

Settings available:
- `model_profile`: balanced | performance | economy — affects which Claude model is used
- `workflow.plan_checking`: true/false — whether to run forge-plan-checker before build
- `workflow.auto_advance`: true/false — whether to auto-proceed between phases without prompting
- `workflow.max_concurrent_agents`: 1-5 — max parallel executor agents in a wave
- `gates.require_spec_approval`: true/false — whether spec must be approved before planning
- `gates.require_pr_review`: true/false — whether PR review is required before release
- `gates.require_deploy_approval`: true/false — whether deploy requires explicit confirmation
- `compliance.change_request_prefix`: string — prefix for CR IDs (default: "CR")
- `compliance.audit_trail`: true/false — whether to maintain audit-trail.md

Current status: Not yet implemented.

Run `/forge:help` to see available commands.
