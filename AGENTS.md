# Adding Brevity tools and strategies

Read this file before changing token-reduction behavior.

## Structure

- `src/core/` — extension orchestration, Copilot hooks, policy, metrics,
  settings, migrations, status, and execution-context handling.
- `src/strategies/` — strategy contracts and implementations shared by tools.
- `src/tools/` — external tool adapters. One tool per directory.
- `src/tools/rtk/` — RTK-specific download, cache, verification, and runtime
  adapter.
- `test/unit/` — fast policy/runtime/registry tests.
- `test/fixtures/` — payload and output fixtures.

## Add a tool

1. Create `src/tools/<tool-id>/index.js`.
2. Export `id`, `name`, `strategies`, `prepare`, `status`, and
   `uninstall`/cleanup methods when applicable.
3. Register the tool in `src/core/toolRegistry.js` usage or in `extension.js`.
4. Keep tool-specific binaries, licenses, checksums, environment variables,
   and failures inside the tool directory.
5. Add focused unit tests in `test/unit/`.

## Add a strategy

1. Create `src/strategies/<strategy-id>/README.md`.
2. Define the strategy input, output, fail-open behavior, metrics, and
   privacy boundary.
3. Implement the core integration in `src/core/` or under the strategy folder.
4. Bind one or more registered tools through an adapter.

## RTK quick reference

RTK is a command-output compression tool only. For RTK work, read only:

- `src/tools/rtk/README.md`
- `src/tools/rtk/runtime.js`
- `src/tools/rtk/index.js`
- `src/core/hook.js`
- `src/core/policy.js`

Do not treat RTK as the overall Brevity lifecycle. Enable, disable, retry,
uninstall, status, rollout, and metrics commands belong to Brevity's core.
