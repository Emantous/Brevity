# RTK Copilot Integration Spike

Issue: [#2](https://github.com/Emantous/Brevity/issues/2)

## Decision

Use RTK as the command-compression engine and integrate it through Copilot
pre-tool hooks for the initial implementation.

- **VS Code GitHub Copilot Chat:** use `rtk hook copilot` with the
  snake_case terminal payload. RTK can return `updatedInput`, replacing
  `git status` with `rtk git status` before the command executes.
- **GitHub Copilot CLI:** use the same RTK hook executable. The current CLI
  runtime can return transparent argument modification for the native
  camelCase payload. The older/other Copilot CLI payload path can use
  deny-with-suggestion behavior instead.
- **Result compression:** RTK is primarily a pre-tool rewrite mechanism.
  The implementation should not depend on post-tool result modification.
- **Distribution:** manage RTK in the extension runtime. Do not require the
  user to install or configure RTK manually.
- **First edition:** start with RTK OSS. Its core hook and command filters
  cover the initial scope, and its license should be reviewed separately
  before full-edition support.

## Verified upstream version

Executable evidence was collected on Linux x86_64 using RTK release
`dev-1.3.0-rc.642`, containing RTK binary `0.49.0`.

The downloaded
`rtk-x86_64-unknown-linux-musl.tar.gz` archive matched SHA-256:

```text
bfc0118a4950afb8a55fc73e06fbb8e83eeb26b87763c3b28d995b3bfae91894
```

The archive checksum was checked against the release's `checksums.txt`.
The exact evidence is kept reproducible with
`test/rtk-copilot-hook-smoke.sh`.

## Executable payload results

The VS Code-style payload:

```json
{"tool_name":"Bash","tool_input":{"command":"git status"}}
```

returned:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecisionReason":"RTK auto-rewrite","updatedInput":{"command":"rtk git status"}}}
```

The VS Code-style payload for `git diff HEAD` returned
`"rtk git diff HEAD"`.

The Copilot CLI-style payload:

```json
{"toolName":"bash","toolArgs":"{\"command\":\"git status\"}"}
```

returned a transparent argument rewrite containing:

```json
{"modifiedArgs":{"command":"rtk git status"}}
```

The same hook rewrote environment-prefixed and compound commands
conservatively, for example:

- `RUST_LOG=debug cargo test` -> `RUST_LOG=debug rtk cargo test`
- `git status && git diff` -> `rtk git status && rtk git diff`

The following inputs produced no hook output and should pass through:

- `rtk git status`
- heredoc commands
- unknown commands such as `htop`
- non-terminal tools
- terminal payloads with no usable command

Running `rtk git status` also produced a concise RTK summary:

```text
* feature/rtk-command-compression
clean - nothing to commit
```

## Hook protocol findings

RTK detects both known payload formats and silently passes through unknown,
unsafe, already-rewritten, and unsupported cases. The implementation should
run RTK with a short timeout and treat every parse failure or hook failure as
fail-open.

The VS Code/PascalCase terminal format supports `updatedInput`. Copilot CLI
native camelCase payloads support `modifiedArgs` in the verified binary.
JetBrains/Copilot IDE-style payloads may require deny-with-suggestion.
The extension should not assume that every IDE exposes the same hook schema.

RTK also records local savings and notices when no hook is installed. Brevity
must own the hook configuration and must not modify unrelated hook entries.

## Shell and command edge cases

The upstream hook was tested only for the payload behavior above. The
implementation issue must still cover:

- shell operators and quoted arguments
- heredocs and multi-line commands
- environment prefixes
- working directories and remote sessions
- shell aliases and nonstandard shells
- PowerShell and Windows executable names
- command exit status and raw-output recovery
- cache corruption, missing binaries, and download failures

RTK should not rewrite commands by prefix heuristics alone. Unknown commands
must continue unchanged, and an explicit bypass/full-output path is required.

## Host and remote support

The initial implementation should distinguish:

1. local VS Code Linux/macOS/Windows hosts
2. VS Code Remote-SSH and Dev Containers
3. WSL
4. Copilot CLI sessions started outside VS Code

A local binary is not necessarily the binary visible inside a remote or
container workspace. The runtime should execute in the workspace context
where the Copilot terminal process runs, or fail open with a clear status.

## Recommended implementation shape

1. Manage a pinned RTK OSS executable in extension-owned storage.
2. Verify platform/architecture and release checksums before execution.
3. Register a Brevity-owned preToolUse hook for VS Code and Copilot CLI.
4. Detect and support only recognized terminal payload schemas.
5. Keep an allowlist for Git and supported build/test/package-manager commands.
6. Pass unknown, already-rewritten, interactive, heredoc, and excluded commands unchanged.
7. Fail open on malformed hook input, timeout, missing binary, or process error.
8. Preserve raw output or an explicit bypass outside the compression path.

## Issue-level follow-ups

- **#3 Runtime:** download, verify, cache, upgrade, and uninstall RTK.
- **#4 Integration:** manage VS Code/Copilot hook configuration safely.
- **#5 Compression:** implement allowlisting and full-output fallback.
- **#6 Security:** audit checksums, subprocesses, data handling, and telemetry.
- **#7 UX:** expose status, settings, savings, and failures.
- **#8 Testing:** turn this smoke test into cross-platform fixtures.
- **#9 Licensing:** confirm and document the selected RTK edition.
- **#10 Docs:** add user setup, privacy, bypass, and troubleshooting guidance.
- **#11 Packaging:** integrate tests and staged release behavior.
- **#12 Pilot:** measure correctness and savings on representative tasks.

## External references

- [RTK upstream](https://github.com/rtk-ai/rtk)
- [RTK Copilot hook README](https://github.com/rtk-ai/rtk/blob/eb710be4719657e8717301caf0eef9a8d8a9e153/hooks/copilot/README.md)
- [GitHub Copilot hooks](https://docs.github.com/en/copilot/concepts/customizations/hooks)
- [GitHub Copilot post-tool-use hooks](https://docs.github.com/en/copilot/how-tos/copilot-sdk/hooks/post-tool-use)
