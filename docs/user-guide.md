# User guide

## Quick start

1. Install the Brevity VS Code extension.
2. Open a workspace folder.
3. Start GitHub Copilot Chat.
4. Wait for the status bar to show `Brevity: Ready`.

Brevity downloads and verifies its managed RTK runtime automatically. You do
not need to install RTK, edit shell aliases, or create hook files manually.

## Status and controls

Use the Command Palette for:

- **Brevity: Show Status** - view runtime integrity, hook state,
  supported command families, and local aggregate metrics.
- **Brevity: Enable** - enable the feature and repair its runtime setup.
- **Brevity: Retry Tools** - retry a failed runtime setup.
- **Brevity: Disable** - stop rewriting and remove
  only Brevity-owned hook entries.
- **Brevity: Uninstall** - remove the managed runtime and
  Brevity-owned hooks.

## Settings

- `brevity.enabled` controls whether rewriting is active.
- `brevity.tools.commands.allowlist` selects supported command families.
- `brevity.tools.commands.excludePatterns` prevents selected commands from being
  rewritten.
- `brevity.tools.commands.overrides` enables individually measured Git filters.
- `brevity.allowBypass` controls raw-output bypass guidance.

## Raw output and privacy

Use `rtk bypass <command>` when you need the original output. Brevity stores
only local aggregate counters and character totals. It does not send command
text, output, file paths, prompts, secrets, or workspace contents to Brevity
telemetry.

## Remote workspaces

Remote SSH, Dev Container, WSL, and local sessions use the extension host
where the workspace is open. If a platform is unsupported, commands remain
unchanged rather than being sent to a different host.

See [Troubleshooting](troubleshooting.md) for recovery steps.
