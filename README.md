# Brevity

Brevity reduces token-heavy command output for GitHub Copilot sessions by
managing RTK automatically inside Visual Studio Code. Users do not need to
install RTK, configure shell aliases, or edit Copilot hook files manually.

## Current status

Brevity now manages a pinned RTK OSS runtime, writes a project Copilot hook,
and applies a conservative command allowlist. It is under active development
and is not yet published on the Visual Studio Code Marketplace.

## Installation and setup

After installing Brevity:

1. Open a folder or workspace in VS Code.
2. Start or open a GitHub Copilot Chat session.
3. Brevity downloads and verifies RTK automatically after VS Code starts.
4. Brevity creates `.github/hooks/rtk-rewrite.json` only inside open
   workspace folders.

No terminal command or manual RTK installation is required.

Check the lower-right status bar for:

- `Brevity: Ready`
- `Brevity: Setup needed`
- `Brevity: No hook`
- `Brevity: Off`

Open **Command Palette** and run **Brevity: Show RTK Runtime Status** for
details including runtime integrity, hook registration, supported command
families, and local aggregate metrics. Use **Brevity: Enable RTK** to
reinitialize the feature after it has been disabled.

## Supported command scope

Brevity initially compresses:

- Measured Git status output through `git status`
- Common npm, pnpm, and yarn test/run/build/list commands
- Common cargo test/build/check/clippy/nextest commands
- Common pytest, Maven, Gradle, .NET, Go, and PHPUnit test/build commands
- Read-only Docker, Kubernetes, and cloud list/describe commands
- Read-only filesystem inspection and safe HTTP metadata/read requests

Unknown, shell-sensitive, and unmeasured Git commands pass through unchanged.
Additional Git filters can be enabled individually with measured command
overrides, such as `{"git diff": true}`.

## Raw output

Use `rtk bypass <command>` to run a command without compression and retain raw
output. For example:

```bash
rtk bypass git status
```

The bypass is also useful if a filtered result appears incomplete.

## Settings

- `brevity.rtk.enabled` — enable or disable Brevity.
- `brevity.rtk.killSwitch` — emergency disable that removes the Brevity hook.
- `brevity.rtk.rolloutStage` — local rollout label: `preview`, `staged`, or
  `general`.
- `brevity.rtk.commands.allowlist` — command families Brevity may handle.
- `brevity.rtk.commands.excludePatterns` — exact prefixes or regular expressions
  beginning with `^` that must remain unchanged.
- `brevity.rtk.allowBypass` — show and preserve the raw-output bypass guidance.

## Commands

| Command | Purpose |
| --- | --- |
| Brevity: Show RTK Runtime Status | Show runtime and hook status |
| Brevity: Enable RTK | Enable Brevity and reinitialize RTK |
| Brevity: Emergency Disable RTK | Immediately stop rewriting and remove the hook |
| Brevity: Retry RTK Runtime Setup | Download or reinitialize RTK |
| Brevity: Disable RTK and Remove Copilot Hook | Disable Brevity and remove its hook |
| Brevity: Uninstall Managed RTK Runtime | Remove the hook and cached runtime |

## Privacy and licensing

Brevity does not send command text, source content, file paths, environment
variables, or hook payloads to Brevity telemetry. RTK tracking remains local
to the user's machine.

The initial runtime is RTK OSS, licensed under Apache-2.0. Full RTK includes
separate license boundaries and is not selected. See
[third-party notices](docs/third-party-notices.md).

## Remote hosts

The runtime is stored in each VS Code execution context. This means Remote
SSH, Dev Containers, WSL, and local VS Code installations need the appropriate
runtime visible in that context. Unsupported platforms pass commands through
unchanged.

## Troubleshooting

See [Troubleshooting](docs/troubleshooting.md) for download, checksum, hook,
Copilot, and raw-output recovery steps.

Release and rollback procedures are documented in
[Release policy](docs/release-policy.md).

Additional guides:

- [User guide](docs/user-guide.md)
- [Administrator guide](docs/administrator-guide.md)
- [Contributor guide](docs/contributor-guide.md)

## Development

```bash
npm install
code .
```

Press `F5` to launch an Extension Development Host.

```bash
npm run lint
npm run test:unit
npm test
npm run test:smoke
npm run test:all
```

See [Testing](docs/testing.md) for test layers and fixtures.

To run the reproducible RTK benchmark fixtures:

```bash
npm run benchmark:rtk
```

This writes `benchmark-report.json` with raw and filtered character/token
counts, exit-status preservation, task-critical detail checks, per-family
thresholds, and an overall pass result. Set
`BREVITY_BENCHMARK_REPORT=/path/to/report.json` to choose another output path.

## Contributing

Contributions and ideas are welcome while the project takes shape. Please
focus changes on the extension's core goal: reducing unnecessary token usage
without making AI-assisted development less useful.

Before submitting a change, run:

```bash
npm run lint
npm test
```

## Third-party notices

RTK licensing and attribution details are recorded in
[Third-party notices](docs/third-party-notices.md).

RTK runtime download, cache, and failure behavior is documented in
[RTK runtime management](docs/rtk-runtime.md).

## License

No license has been declared yet.
