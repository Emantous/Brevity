# Contributor guide

## Local setup

Install the repository dependencies with:

```bash
npm ci
```

No RTK installation, API key, test credential, or manually created hook file
is required. The extension tests create temporary workspaces and fixtures.

## Validation commands

```bash
npm run lint
npm run test:unit
npm test
npm run test:smoke
npm run benchmark:rtk
npm run package
npm run package:check
```

`npm run benchmark:rtk` creates a local `benchmark-report.json`. Set
`BREVITY_BENCHMARK_REPORT` to write it elsewhere.

## Change expectations

Keep command handling conservative. New command families need evidence that
task-critical details and exit status survive filtering. Destructive,
privileged, secret-bearing, shell-sensitive, and ambiguous commands must pass
through unchanged.

Runtime, hook, policy, and metrics changes need focused tests. Metrics must
remain aggregate-only and must not store commands, output, paths, prompts,
secrets, or workspace contents.

## Packaging

Build the VSIX with `npm run package`, then inspect it with
`npm run package:check`. The package must not contain runtime binaries, test
fixtures, credentials, source maps, or development-only files.

## Pull requests

Describe the behavioral change, safety impact, validation commands, and any
new user-visible setup. Do not include generated `.vscode-test` directories or
benchmark reports unless they are explicitly being reviewed.
