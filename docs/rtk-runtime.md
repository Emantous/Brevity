# RTK runtime management

Brevity manages RTK OSS without adding RTK to the user's shell PATH.

## Managed state

The executable and metadata are stored under VS Code's extension global
storage:

```text
<global-storage>/rtk/dev-1.3.0-rc.642/
  rtk or rtk.exe
  LICENSE
  manifest.json
```

The runtime is pinned to RTK release `dev-1.3.0-rc.642` and binary version
`0.49.0`. The archive and executable are not included in the VSIX.

## Supported targets

The runtime currently resolves:

- Linux x64 and arm64 using musl archives
- macOS x64 and arm64
- Windows x64

Windows arm64 and unsupported operating systems fail open. They are reported
in the Brevity output channel and RTK setup status.

## Installation behavior

Brevity downloads RTK after VS Code startup when `brevity.rtk.enabled` is true.
The download has a 30-second timeout, bounded archive size, three attempts,
and bounded redirects. The release `checksums.txt` entry must match the
SHA-256 hash of the downloaded archive before extraction.

The extracted executable and license are copied into extension-owned storage.
A manifest records the release tag, asset name, archive hash, and executable
hash. Cached executables are reused only when the executable hash matches the
manifest.

The runtime status and retry commands are:

- `Brevity: Show RTK Runtime Status`
- `Brevity: Retry RTK Runtime Setup`
- `Brevity: Disable RTK and Remove Copilot Hook`
- `Brevity: Uninstall Managed RTK Runtime`

## Copilot hook integration

After RTK is installed, Brevity creates:

```text
.github/hooks/rtk-rewrite.json
```

The hook points directly to the managed RTK executable. It does not rely on
the user's PATH or a shell alias.

For a multi-root VS Code workspace, Brevity writes the hook into each open
workspace folder. In Remote-SSH, Dev Container, and WSL sessions, the hook is
created by the extension in the remote workspace and uses the remote managed
executable.

The project-level JSON is parsed before changes are made. Brevity preserves
unrelated hook entries and removes only entries carrying its
`BREVITY_RTK_HOOK_V1` marker. Repeated enable or retry operations replace the
existing Brevity entry rather than adding duplicates.

Disabling the setting or running the disable command removes Brevity's entry.
If no other hooks remain, Brevity removes the empty hook file. No unrelated
Copilot configuration is deleted.

## Command compression policy

Brevity uses a conservative allowlist before calling RTK:

- measured `git status` output by default
- `npm`, `pnpm`, and `yarn` test/run/build/list-style commands
- `cargo` test/build/check/clippy/nextest commands
- common `pytest`, Maven, Gradle, .NET, Go, and PHPUnit test/build commands
- read-only Docker, Kubernetes, and cloud list/describe commands
- read-only filesystem inspection and safe HTTP metadata/read commands

The settings:

- `brevity.rtk.commands.allowlist`
- `brevity.rtk.commands.excludePatterns`
- `brevity.rtk.commands.overrides`

control this policy. An exclusion may be an exact command prefix or a regular
expression beginning with `^`. Git filters that have not met the measured
savings threshold remain disabled unless explicitly enabled with an override,
for example `{"git diff": true}`.

Unknown commands, commands containing shell operators, heredocs, redirections,
commands using `sudo`, and explicit `rtk bypass` commands pass through without
RTK rewriting. Git mutating commands such as `git rebase` are not included in
the initial allowlist.

For raw output, run `rtk bypass <command>` in the terminal. RTK executes the
command without filtering and tracks the bypass locally where supported.

## Failure behavior

If a download, checksum, extraction, cache, or archive version check fails,
Brevity records the failure in the output channel and shows a status message.
Runtime setup never modifies the user's PATH and does not block command
execution. Unsupported or failed setup leaves commands unchanged.

## Security boundaries

RTK archives are pinned to immutable SHA-256 digests for this RTK release.
Brevity refuses the download unless the archive hash matches the digest
embedded in the extension. Downloads and redirects must use HTTPS.

The Copilot hook wrapper passes only a small allowlist of operating-system
environment variables to RTK. Secret-bearing variables such as GitHub tokens
and API keys are not inherited by the hook subprocess.

The wrapper uses argument arrays rather than shell interpolation for the RTK
process and fails open if RTK times out, exits unexpectedly, or returns no
valid hook response.

## Privacy statement

Brevity sends no command text, source content, file paths, environment
variables, or hook payloads to Brevity-operated telemetry. RTK's command
tracking is local to the user's machine. Brevity reports only coarse status
messages such as runtime ready, runtime unavailable, or checksum failure.
