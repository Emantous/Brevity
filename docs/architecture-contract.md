# Brevity integration architecture contract

## Decision

Brevity is a local, fail-open command-output adapter for VS Code Copilot Chat
and Copilot CLI. It owns runtime acquisition, policy evaluation, hook
registration, aggregate metrics, and recovery. RTK owns output compression.

## Data flow

```text
Copilot terminal request
        |
        v
Brevity hook wrapper
  - parse payload
  - reject unsafe/unknown commands
  - invoke managed RTK
        |
        v
RTK hook response
  - preserve approved response envelope
  - preserve exit/failure information
        |
        v
Copilot terminal result
```

The wrapper never executes the original command itself. If parsing, policy,
runtime startup, timeout, response validation, or metrics writing fails, it
returns an empty hook response so the host can continue with the original
request.

## Ownership boundaries

| Concern | Owner |
| --- | --- |
| Runtime download, digest verification, extraction, cache | Brevity |
| Command parsing and safety policy | Brevity |
| Output compression | RTK |
| Copilot hook registration and removal | Brevity |
| Terminal execution and permissions | Copilot host |
| Local aggregate metrics | Brevity |

Destructive, privileged, secret-bearing, shell-sensitive, mutation, wrapper,
deployment, and unknown commands remain unchanged.

## Process and payload limits

- Hook subprocess timeout: 5 seconds.
- Hook input and RTK output buffer: 1 MiB.
- Runtime download timeout: 30 seconds.
- Runtime download retries: 3.
- Runtime archive size limit: 30 MiB.
- Runtime redirect limit: 5 trusted HTTPS redirects.
- Runtime and policy files use extension-owned storage and restrictive file
  permissions.

## Execution contexts

The extension host is the source of truth for runtime location. Local,
Remote-SSH, Dev Container, and WSL hosts download and execute RTK in their
own extension-host context. Workspace hooks are written to the corresponding
workspace folders. No local executable or secret is copied into a remote
context.

## Lifecycle and failure states

1. Activation checks settings and the execution context.
2. Runtime setup verifies the pinned asset and cached manifest.
3. Hook installation replaces only Brevity-owned entries.
4. Configuration changes re-write policy and repair the hook.
5. Disable, emergency disable, uninstall, disconnect, and rebuild are
   idempotent and preserve unrelated configuration.
6. Any failure remains fail-open and is surfaced through status/output
   diagnostics without blocking the terminal request.

## Privacy contract

Metrics contain aggregate counts and character totals only. Commands, output,
paths, prompts, secrets, and workspace contents are not sent to a service or
stored in the metrics file.
