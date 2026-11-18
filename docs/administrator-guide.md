# Administrator guide

## Supported deployment model

Brevity is a local VS Code extension. It does not require a Brevity account,
server, API key, or hosted telemetry service. RTK is downloaded from the
pinned release source over HTTPS and verified before execution.

## Policy controls

Administrators can use VS Code settings or workspace policy to control:

- `brevity.enabled`
- `brevity.tools.commands.allowlist`
- `brevity.tools.commands.excludePatterns`
- `brevity.tools.commands.overrides`
- `brevity.allowBypass`

The default policy is conservative. Unknown, shell-sensitive, destructive,
privileged, secret-bearing, deployment, and mutation commands pass through
unchanged.

## Files and ownership

Brevity owns only:

- its extension-managed runtime and manifest in VS Code global storage;
- its managed policy file in extension global storage;
- the Brevity-marked entry in `.github/hooks/rtk-rewrite.json`;
- local aggregate metrics.

Hook updates preserve unrelated entries. Disable and uninstall remove
Brevity-owned entries without deleting unrelated Copilot configuration.

## Remote and restricted environments

The runtime must be downloaded and executed in the relevant extension-host
context. Remote SSH, containers, and WSL should be provisioned from their
corresponding VS Code context, not by copying a local host executable.

If downloads, verification, or startup fail, the extension remains fail-open:
commands continue without rewriting. Use the status command and
[Troubleshooting](troubleshooting.md) to diagnose the failure.

## Release and rollback

Before rollout, run the lint, unit, integration, smoke, benchmark, and VSIX
content checks documented in [Testing](testing.md) and
[Release policy](release-policy.md). To stop rewriting immediately, disable
the feature or run the disable command. To remove managed state, use the
uninstall command.
