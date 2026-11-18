# Testing Brevity

## Test layers

- `npm run test:unit` runs pure Node unit tests for command policy, platform
  resolution, redirects, archive paths, and corrupted cache handling.
- `npm test` launches a VS Code Extension Development Host and runs
  `test/extension.test.js`.
- `npm run test:smoke` downloads and verifies the pinned RTK OSS archive,
  then checks representative VS Code and Copilot CLI hook payloads.
- `npm run test:all` runs lint, unit tests, extension-host tests, and RTK
  smoke tests in sequence.
- `npm run pilot` runs the local privacy-preserving Git output pilot.

## Fixtures

Copilot payload fixtures are stored in
`test/fixtures/copilot-payloads.json`. Example raw and rewritten command output
is stored in `test/fixtures/command-outputs.json`.

The fixtures contain no secrets or workspace paths. Tests use temporary
directories and never read source files as test input.

## Extension host setup

The extension host suite is selected by `.vscode-test.mjs`:

```text
test/*.test.js
```

Pure Node tests under `test/unit/` are intentionally not loaded into the VS
Code Mocha host.

## Manual smoke test

Press `F5`, open the Command Palette, and run:

1. **Brevity: Retry RTK Runtime Setup**
2. **Brevity: Show RTK Runtime Status**
3. **Brevity: Disable RTK and Remove Copilot Hook**
4. **Brevity: Uninstall Managed RTK Runtime**
