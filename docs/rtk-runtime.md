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

## Failure behavior

If a download, checksum, extraction, cache, or archive version check fails,
Brevity records the failure in the output channel and shows a status message.
Runtime setup never modifies the user's PATH and does not block command
execution. Unsupported or failed setup leaves commands unchanged.
