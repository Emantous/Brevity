# Tool and strategy development

This repository separates Brevity's product lifecycle from individual
token-reduction implementations.

## Directories

| Path | Responsibility |
| --- | --- |
| `src/core/` | Activation, settings, hooks, policy, metrics, status, migrations |
| `src/strategies/` | Reusable reduction strategy contracts |
| `src/tools/` | External tool adapters and tool-specific runtime code |
| `src/tools/rtk/` | RTK-specific implementation |

Compatibility modules remain at older `src/*.js` paths temporarily, but new
code should import from the directory that owns the behavior.

## Tool contract

A tool adapter should export:

- `id`: stable machine name
- `name`: user-facing name
- `strategies`: strategy IDs implemented by the tool
- `prepare(context)`: install or verify the tool
- `status(context)`: report readiness
- optional cleanup and retry methods

Tools must fail open and must not own the extension-wide enable/disable
commands. All tools are prepared and controlled through Brevity core.
