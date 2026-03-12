# Forge Settings Workflow

View and interactively edit the forge configuration for the current project.
This workflow is invoked by `/forge:settings`.

Config is layered — values cascade from lowest to highest priority:
  1. Built-in defaults (hardcoded in forge)
  2. User config (`~/.forge/config.json`)
  3. Project config (`.forge/config.json` in the current project)
  4. CLI flags (per-invocation overrides, not persisted)

`/forge:settings` reads and writes the **project config** only. To change user-level
defaults, edit `~/.forge/config.json` directly.

---

## Step 1: Verify .forge/ exists

Check if `.forge/config.json` exists in the current working directory.

If `.forge/` does not exist at all:
```
No .forge/ directory found.

This project has not been initialized with forge.
Run /forge:map to set up the .forge/ directory structure.
```
Stop.

If `.forge/` exists but `.forge/config.json` does not:
```
No project config found at .forge/config.json.
Run /forge:map to generate one, or continue to create it now.
```
Offer to create a default config (proceed to Step 3 with all values as defaults).

---

## Step 2: Load configs and display current settings

Read `.forge/config.json` (project) and `~/.forge/config.json` (user) if it exists.

Display the current effective configuration, showing the source of each value:

```
FORGE SETTINGS
══════════════════════════════════════════════════
Project: [project name from state.json `task` field, or directory name]
Config:  .forge/config.json

 SETTING                        VALUE           SOURCE
 ─────────────────────────────────────────────────────
 Workflow
   plan_checking                [true/false]    [project|user|default]
   auto_advance                 [true/false]    [project|user|default]
   max_concurrent_agents        [1-5]           [project|user|default]

 Gates
   require_spec_approval        [true/false]    [project|user|default]
   require_pr_review            [true/false]    [project|user|default]
   require_deploy_approval      [true/false]    [project|user|default]

 Compliance
   change_request_prefix        [string]        [project|user|default]
   audit_trail                  [true/false]    [project|user|default]

══════════════════════════════════════════════════
```

**SOURCE column logic:**
- `project` — the value is set in `.forge/config.json`
- `user` — the value is not in project config but is set in `~/.forge/config.json`
- `default` — neither config sets this value; the built-in default applies

---

## Step 3: Ask what to do

Use the AskUserQuestion tool with:
  - Edit a setting: Change the value of a specific configuration setting
  - Reset to default: Remove a project override and fall back to user or built-in default
  - View descriptions: Show full documentation for all available settings
  - Exit: No changes — close the settings editor

If the user selects "Other" and provides an explanation, read it carefully. If they name
or describe a specific setting they want to change, treat it as "Edit a setting" and proceed
directly. If the intent is unclear, ask a follow-up question.

---

## Step 4a: Edit a setting (user selected "Edit a setting")

Ask which setting to change:
```
Which setting? (e.g. "plan_checking", "require_pr_review", "audit_trail"):
```
Wait for input.

Look up the setting in the schema below. If the name is not recognized:
```
Unknown setting: [input]

Valid settings:
  workflow.plan_checking, workflow.auto_advance, workflow.max_concurrent_agents
  gates.require_spec_approval, gates.require_pr_review, gates.require_deploy_approval
  compliance.change_request_prefix, compliance.audit_trail
```
Return to Step 3.

Show the current value and ask for the new one:
```
[setting]: [current value] ([source])
New value:
```
Wait for input. Validate against the schema (see Setting Schema below).

If validation fails, show the allowed type/range and return to the prompt.

If valid, write the updated value to `.forge/config.json`, preserving all other fields.

Confirm:
```
Updated: [setting] = [new value]
Saved to .forge/config.json
```

Return to Step 2 (redisplay the full table with the updated value).

---

## Step 4b: Reset a setting (user selected "Reset to default")

Ask which setting to reset:
```
Which setting to reset to default?
```
Wait for input.

Show the current value and the default:
```
[setting]: [current value] → [default value]
Confirm reset? [Y/n]:
```

If confirmed: remove the key from `.forge/config.json` (let it fall through to user or default).
Confirm:
```
Reset: [setting] will now use [user config value | built-in default]: [value]
```

Return to Step 2.

---

## Step 4c: View setting descriptions (user selected "View descriptions")

Display the full setting reference:

```
SETTING REFERENCE
══════════════════════════════════════════════════

WORKFLOW

  plan_checking  (boolean, default: true)
    Run forge-plan-checker before every /forge:authorize.
    The checker validates plans across 8 dimensions and blocks builds
    that fail validation. Disable only if plan checking is too slow
    for rapid iteration.

  auto_advance  (boolean, default: false)
    Automatically proceed between phases without prompting.
    When false (default), forge pauses after each step and waits
    for explicit confirmation. Enabling this is not recommended for
    compliance workflows — human gates exist for a reason.

  max_concurrent_agents  (integer 1-5, default: 3)
    Maximum number of parallel executor agents during a build wave.
    Higher values speed up multi-task builds but consume more context.
    Set to 1 for sequential execution (easier to debug).

GATES

  require_spec_approval  (boolean, default: true)
    Require explicit human approval before /forge:plan proceeds.
    This is Gate 0 — the spec must be confirmed before planning begins.
    Disabling bypasses the first human check in the compliance chain.

  require_pr_review  (boolean, default: true)
    Require a PR to be created and reviewed before /forge:release.
    This is Gate 2 — the four-eyes requirement for NIGC 543.20(g).
    Disabling this breaks segregation-of-duties compliance.

  require_deploy_approval  (boolean, default: true)
    Require explicit human confirmation before any deployment.
    This is Gate 3 — no automated deploy without a conscious human decision.
    Disabling this breaks the deploy approval requirement.

COMPLIANCE

  change_request_prefix  (string, default: "CR")
    Prefix used for change request IDs (e.g., "CR-2026-001").
    Change only if your organization uses a different convention.

  audit_trail  (boolean, default: true)
    Append significant actions to .forge/compliance/audit-trail.md.
    Disabling this breaks NIGC 543.20(d) audit trail compliance.
    Do not disable in a regulated environment.

══════════════════════════════════════════════════
```

Return to Step 3.

---

## Step 4d: Exit (user selected "Exit")

```
No changes made.
```
Stop.

---

## Setting Schema (validation reference)

| Setting | Type | Allowed values | Default |
|---|---|---|---|
| `workflow.plan_checking` | boolean | `true`, `false` | `true` |
| `workflow.auto_advance` | boolean | `true`, `false` | `false` |
| `workflow.max_concurrent_agents` | integer | `1`, `2`, `3`, `4`, `5` | `3` |
| `gates.require_spec_approval` | boolean | `true`, `false` | `true` |
| `gates.require_pr_review` | boolean | `true`, `false` | `true` |
| `gates.require_deploy_approval` | boolean | `true`, `false` | `true` |
| `compliance.change_request_prefix` | string | any non-empty string | `"CR"` |
| `compliance.audit_trail` | boolean | `true`, `false` | `true` |

**Warning block for dangerous changes:**
If the user tries to set any of `require_pr_review`, `require_deploy_approval`, or
`audit_trail` to `false`, display a warning before accepting:

```
⚠ WARNING: Disabling [setting] reduces NIGC 25 CFR 543.20 compliance.
This should only be done in non-regulated development environments.
Confirm? Type YES to proceed:
```

Only accept the change if the user types `YES` exactly. Any other input cancels.
